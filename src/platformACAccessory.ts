import { Service, PlatformAccessory, Logger } from 'homebridge';

import { AirtouchPlatform } from './platform';

import { AC, Zone } from './airTouchWrapper';
import { AirtouchAPI } from './api';
import { MAGIC } from './magic';

export class AirTouchACAccessory {
  private service: Service;
  // private fanService: Service;
  AirtouchId;
  ACNumber;
  minTemp: number;
  maxTemp: number;
  step: number;
  log: Logger;
  ac: AC;
  zones: Array<Zone>;
  api: AirtouchAPI;
  constructor(
    private readonly platform: AirtouchPlatform,
    private readonly accessory: PlatformAccessory,
    AirtouchId,
    ACNumber,
    ac: AC,
    zones: Array<Zone>,
    log: Logger,
    api: AirtouchAPI,
  ) {
    this.AirtouchId = AirtouchId;
    this.ACNumber = ACNumber;
    this.minTemp = 15;
    this.maxTemp = 30;
    this.step = 1;
    this.log = log;
    this.ac = ac;
    this.zones = zones;
    this.api = api;
    this.accessory.getService(this.platform.Service.AccessoryInformation)
      ?.setCharacteristic(
        this.platform.Characteristic.Manufacturer,
        'AirTouch',
      )
      .setCharacteristic(
        this.platform.Characteristic.Model,
        'AirTouch 5',
      )
      .setCharacteristic(
        this.platform.Characteristic.SerialNumber,
        this.AirtouchId || 'Unknown',
      );

    this.service = this.accessory.getService(this.platform.Service.HeaterCooler) ||
                    this.accessory.addService(this.platform.Service.HeaterCooler);

    this.service.getCharacteristic(this.platform.Characteristic.CurrentHeaterCoolerState)
      .onGet(this.handleCurrentHeaterCoolerStateGet.bind(this));

    this.service.getCharacteristic(this.platform.Characteristic.TargetHeaterCoolerState)
      .onGet(this.handleTargetHeaterCoolerStateGet.bind(this))
      .onSet(this.handleTargetHeaterCoolerStateSet.bind(this));

    this.service.getCharacteristic(this.platform.Characteristic.CurrentTemperature)
      .onGet(this.handleCurrentTemperatureGet.bind(this));

    this.service.getCharacteristic(this.platform.Characteristic.Active)
      .onGet(this.handleActiveGet.bind(this))
      .onSet(this.handleActiveSet.bind(this));

    this.service.getCharacteristic(this.platform.Characteristic.Name)
      .onGet(this.handleNameGet.bind(this));

    this.service.getCharacteristic(this.platform.Characteristic.CoolingThresholdTemperature)
      .onGet(this.handleTargetTemperatureGet.bind(this))
      .onSet(this.handleTargetTemperatureSet.bind(this)).setProps({
        minValue: this.minTemp,
        maxValue: this.maxTemp,
        minStep: this.step,
      });
    this.service.getCharacteristic(this.platform.Characteristic.HeatingThresholdTemperature)
      .onGet(this.handleTargetTemperatureGet.bind(this))
      .onSet(this.handleTargetTemperatureSet.bind(this)).setProps({
        minValue: this.minTemp,
        maxValue: this.maxTemp,
        minStep: this.step,
      });

    this.service.getCharacteristic(this.platform.Characteristic.RotationSpeed)
      .onGet(this.handleRotationSpeedGet.bind(this))
      .onSet(this.handleRotationSpeedSet.bind(this)).setProps({
        minValue: 0,
        maxValue: 99,
        minStep: 33,
      });
  }

  updateStatus(ac: AC, zones: Array<Zone>) {
    this.zones = zones;
    this.ac = ac;
  }

  handleRotationSpeedGet() {
    const ac_status = this.ac.ac_status!;
    return (+ac_status.ac_fan_speed-1)*33;
  }

  handleRotationSpeedSet(value) {
    this.api.acSetFanSpeed(this.ac.ac_number, (value/33)+1);
  }

  handleActiveGet() {
    const ac_status = this.ac.ac_status!;
    switch(+ac_status.ac_power_state) {
      case 0:
        return this.platform.Characteristic.Active.INACTIVE;
        break;
      case 1:
        return this.platform.Characteristic.Active.ACTIVE;
        break;
      case 2:
        return this.platform.Characteristic.Active.INACTIVE;
        break;
      case 3:
        return this.platform.Characteristic.Active.ACTIVE;
        break;
      default:
        return this.platform.Characteristic.Active.INACTIVE;
        break;
    }
  }

  handleActiveSet(value) {
    switch(value) {
      case this.platform.Characteristic.Active.INACTIVE:
        this.api.acSetActive(+this.ac.ac_number, false);
        break;
      case this.platform.Characteristic.Active.ACTIVE:
        this.api.acSetActive(+this.ac.ac_number, true);
        break;
    }
  }

  // check if value is undefined, and replace it with a default value
  isNull(val, nullVal) {
    return val === undefined ? nullVal : val;
  }

  updateAll() {
    this.service.getCharacteristic(this.platform.Characteristic.TargetHeatingCoolingState)
      .updateValue(this.handleTargetHeaterCoolerStateGet());
    this.service.getCharacteristic(this.platform.Characteristic.CurrentHeatingCoolingState)
      .updateValue(this.handleCurrentHeaterCoolerStateGet());
    this.service.getCharacteristic(this.platform.Characteristic.CurrentTemperature)
      .updateValue(this.handleCurrentTemperatureGet());
  }

  /**
   * Handle requests to get the current value of the "Name" characteristic
   */
  handleNameGet() {
    return this.ac.ac_ability.ac_name;
  }


  areAllZonesClosed(ac_number: number) {
    for(let i = 0; i<16; i++) {
      if(this.zones[i] !== undefined) {
        if(this.zones[i].zone_status !== undefined) {
          if(+this.zones[i].ac_number === ac_number && +this.zones[i].zone_status!.zone_damper_position !== 0) {
            return false;
          }
        }
      }
    }
    return true;
  }

  /**
   * Handle requests to get the current value of the "Current Heater-Cooler State" characteristic
   */
  handleCurrentHeaterCoolerStateGet() {
    const ac_status = this.ac.ac_status!;
    const ac_mode = +ac_status.ac_mode;
    const zones_all_off = this.areAllZonesClosed(this.ac.ac_number);
    if(+ac_status.ac_power_state === 0){
      this.log.debug('Returning inactive status for state of AC');
      return this.platform.Characteristic.CurrentHeaterCoolerState.INACTIVE;
    }
    if(zones_all_off === true) {
      return this.platform.Characteristic.CurrentHeaterCoolerState.IDLE;
    }

    const ac_target = ac_status.ac_target;
    const ac_current = ac_status.ac_temp;
    switch(ac_mode) {
      case 0:
        if(ac_target < ac_current) {
          return this.platform.Characteristic.CurrentHeaterCoolerState.COOLING;
        } else {
          return this.platform.Characteristic.CurrentHeaterCoolerState.HEATING;
        }
        break;
      case 1:
        return this.platform.Characteristic.CurrentHeaterCoolerState.HEATING;
        break;
      case 2:
        this.log.info('AC is set to DRY mode.  This is currently unhandled.  Reporting it as cool instead. ');
        return this.platform.Characteristic.CurrentHeaterCoolerState.COOLING;
        break;
      case 3:
        this.log.info('AC is set to FAN mode.  This is currently unhandled.  Reporting it as cool instead. ');
        return this.platform.Characteristic.CurrentHeaterCoolerState.COOLING;
        break;
      case 4:
        return this.platform.Characteristic.CurrentHeaterCoolerState.COOLING;
        break;
      case 8:
        return this.platform.Characteristic.CurrentHeaterCoolerState.HEATING;
        break;
      case 9:
        return this.platform.Characteristic.CurrentHeaterCoolerState.COOLING;
        break;
      default:
        this.log.info('Unhandled ac_mode in getCurrentHeatingCoolingState. Returning off as fail safe.');
        return this.platform.Characteristic.CurrentHeaterCoolerState.IDLE;
        break;
    }

  }


  /**
   * Handle requests to get the current value of the "Target Heater-Cooler State" characteristic
   */
  handleTargetHeaterCoolerStateGet() {
    const ac_mode = +this.ac.ac_status!.ac_mode;
    switch(ac_mode) {
      case 0:
        return this.platform.Characteristic.TargetHeaterCoolerState.AUTO;
        break;
      case 1:
        return this.platform.Characteristic.TargetHeaterCoolerState.HEAT;
        break;
      case 2:
        this.log.info('AC is set to DRY mode.  This is currently unhandled.  Reporting it as cool instead. ');
        return this.platform.Characteristic.TargetHeaterCoolerState.COOL;
        break;
      case 3:
        this.log.info('AC is set to FAN mode.  This is currently unhandled.  Reporting it as cool instead. ');
        return this.platform.Characteristic.TargetHeaterCoolerState.COOL;
        break;
      case 4:
        return this.platform.Characteristic.TargetHeaterCoolerState.COOL;
        break;
      case 8:
        return this.platform.Characteristic.TargetHeaterCoolerState.HEAT;
        break;
      case 9:
        return this.platform.Characteristic.TargetHeaterCoolerState.COOL;
        break;
      default:
        this.log.info('Unhandled ac_mode in getTargetACHeatingCooling. Returning auto as fail safe.');
        return this.platform.Characteristic.TargetHeaterCoolerState.AUTO;
        break;
    }
  }

  /**
   * Handle requests to set the "Target Heater-Cooler State" characteristic
   */
  handleTargetHeaterCoolerStateSet(value) {
    const ac_number = this.ac.ac_number;
    switch(value) {
      case this.platform.Characteristic.TargetHeaterCoolerState.COOL:
        this.api.acSetTargetHeatingCoolingState(ac_number, MAGIC.AC_TARGET_STATES.COOL);
        break;
      case this.platform.Characteristic.TargetHeatingCoolingState.HEAT:
        this.api.acSetTargetHeatingCoolingState(ac_number, MAGIC.AC_TARGET_STATES.HEAT);
        break;
      case this.platform.Characteristic.TargetHeatingCoolingState.AUTO:
        this.api.acSetTargetHeatingCoolingState(ac_number, MAGIC.AC_TARGET_STATES.AUTO);
        break;
    }
  }

  /**
   * Handle requests to get the current value of the "Current Temperature" characteristic
   */
  handleCurrentTemperatureGet() {
    const ac_status = this.ac.ac_status!;
    return ac_status.ac_temp;
  }

  /**
   * Handle requests to get the current value of the "Current Temperature" characteristic
   */
  handleTargetTemperatureGet() {
    const ac_status = this.ac.ac_status!;
    return ac_status.ac_target;
  }

  /**
     * Handle requests to get the current value of the "Current Temperature" characteristic
     */
  handleTargetTemperatureSet(value) {
    this.api.acSetTargetTemperature(this.ac.ac_number, value);
  }

}
