import { Service, PlatformAccessory, Logger } from 'homebridge';
import { AirtouchPlatform } from './platform';
import { AC, Zone } from './airTouchWrapper';
import { AirtouchAPI } from './api';
import { MAGIC } from './magic';

export class AirTouchZoneAccessory {
  private service: Service;
  AirtouchId;
  ZoneNumber;
  minTemp: number;
  maxTemp: number;
  step: number;
  private ac: AC;
  private zone: Zone;
  log: Logger;
  api: AirtouchAPI;

  constructor(
    private readonly platform: AirtouchPlatform,
    private readonly accessory: PlatformAccessory,
    AirtouchId: string,
    ZoneNumber: number,
    zone: Zone,
    ac: AC,
    log: Logger,
    api: AirtouchAPI,
  ) {
    this.AirtouchId = AirtouchId;
    this.ZoneNumber = ZoneNumber;
    this.minTemp = 0;
    this.maxTemp = 35;
    this.step = 1;
    this.ac = ac;
    this.zone = zone;
    this.log = log;
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
      .onGet(this.handleCurrentHeatingCoolingStateGet.bind(this));

    this.service.getCharacteristic(this.platform.Characteristic.TargetHeaterCoolerState)
      .onGet(this.handleTargetHeatingCoolingStateGet.bind(this))
      .onSet(this.handleTargetHeatingCoolingStateSet.bind(this));

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
      .onGet(this.handleRotationSpeedGet.bind(this));
    if(+this.zone.zone_status!.zone_has_sensor === 0) {
      this.log.debug('Zone doesn\'t have a sensor: '+this.zone.zone_number);
      this.service.getCharacteristic(this.platform.Characteristic.RotationSpeed)
        .onSet(this.handleRotationSpeedSet.bind(this)).setProps({
          minValue: 0,
          maxValue: 100,
          minStep: 5,
        });
    }
  }

  updateStatus(zone: Zone, ac: AC) {
    this.zone = zone;
    this.ac = ac;
    this.updateAll();
  }

  handleRotationSpeedGet() {
    const zone_status = this.zone.zone_status!;
    return zone_status.zone_damper_position;
  }

  handleRotationSpeedSet(value) {
    this.log.debug('Zone setting rotation speed to: '+value);
    this.api.zoneSetPercentage(+this.zone.zone_number, value);
  }

  handleActiveGet() {
    const zone_status = this.zone.zone_status!;
    switch(+zone_status.zone_power_state) {
      case 0:
        return this.platform.Characteristic.Active.INACTIVE;
        break;
      case 1:
        return this.platform.Characteristic.Active.ACTIVE;
        break;
      default:
        return this.platform.Characteristic.Active.INACTIVE;
        break;
    }
  }

  handleActiveSet(value) {
    this.log.debug('Zone setting active to: '+value);
    switch(value) {
      case this.platform.Characteristic.Active.INACTIVE:
        this.api.zoneSetActive(+this.zone.zone_number, false);
        break;
      case this.platform.Characteristic.Active.ACTIVE:
        this.api.zoneSetActive(+this.zone.zone_number, true);
        break;
    }
  }


  // check if value is undefined, and replace it with a default value
  isNull(val, nullVal) {
    return val === undefined ? nullVal : val;
  }

  updateAll() {
    this.service.getCharacteristic(this.platform.Characteristic.TargetHeaterCoolerState)
      .updateValue(this.handleTargetHeatingCoolingStateGet());
    this.service.getCharacteristic(this.platform.Characteristic.CurrentHeaterCoolerState)
      .updateValue(this.handleCurrentHeatingCoolingStateGet());
    this.service.getCharacteristic(this.platform.Characteristic.CurrentTemperature)
      .updateValue(this.handleCurrentTemperatureGet());
    this.service.getCharacteristic(this.platform.Characteristic.CoolingThresholdTemperature)
      .updateValue(this.handleTargetTemperatureGet());
    this.service.getCharacteristic(this.platform.Characteristic.HeatingThresholdTemperature)
      .updateValue(this.handleTargetTemperatureGet());
    this.service.getCharacteristic(this.platform.Characteristic.Name)
      .updateValue(this.handleNameGet());
    this.service.getCharacteristic(this.platform.Characteristic.Active)
      .updateValue(this.handleActiveGet());
    this.service.getCharacteristic(this.platform.Characteristic.RotationSpeed)
      .updateValue(this.handleRotationSpeedGet());
  }

  /**
   * Handle requests to get the current value of the "Name" characteristic
   */
  handleNameGet() {
    return this.zone.zone_name;
  }

  /**
   * Handle requests to get the current value of the "Current Heater-Cooler State" characteristic
   */
  handleCurrentHeatingCoolingStateGet() {
    const zone_status = this.zone.zone_status!;
    const power_state = +zone_status.zone_power_state;
    const ac_mode = +this.ac.ac_status!.ac_mode;
    if(power_state === 0){
      return this.platform.Characteristic.CurrentHeaterCoolerState.INACTIVE;
    } else {
      if(+zone_status.zone_damper_position === 0) {
        return this.platform.Characteristic.CurrentHeaterCoolerState.IDLE;
      }
      // Damper is open, so let's extrapolate from the AC Mode.
      const zone_target = +zone_status.zone_target;
      const zone_current = +zone_status.zone_temp;
      switch(ac_mode) {
        case 0:
          if(zone_target < zone_current) {
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
          return this.platform.Characteristic.CurrentHeaterCoolerState.INACTIVE;
          break;
      }
    }
  }


  /**
   * Handle requests to get the current value of the "Target Heater-Cooler State" characteristic
   */
  handleTargetHeatingCoolingStateGet() {
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
        this.log.info('Unhandled ac_mode in getTargetHeatingCoolingState. Returning auto as fail safe.');
        return this.platform.Characteristic.TargetHeaterCoolerState.AUTO;
        break;
    }
  }

  /**
   * Handle requests to set the "Target Heater-Cooler State" characteristic
   */
  handleTargetHeatingCoolingStateSet(value) {
    this.log.debug('Zone setting target cooling state to to: '+value);
    const zone_number = this.zone.zone_number;
    switch(value) {
      case this.platform.Characteristic.TargetHeaterCoolerState.COOL:
        this.api.zoneSetActive(zone_number, true);
        this.api.acSetTargetHeatingCoolingState(this.ac.ac_number, MAGIC.AC_TARGET_STATES.COOL);
        break;
      case this.platform.Characteristic.TargetHeatingCoolingState.HEAT:
        this.api.zoneSetActive(zone_number, true);
        this.api.acSetTargetHeatingCoolingState(this.ac.ac_number, MAGIC.AC_TARGET_STATES.HEAT);
        break;
      case this.platform.Characteristic.TargetHeatingCoolingState.AUTO:
        this.api.zoneSetActive(zone_number, true);
        this.api.acSetTargetHeatingCoolingState(this.ac.ac_number, MAGIC.AC_TARGET_STATES.AUTO);
        break;
    }
  }

  /**
   * Handle requests to get the current value of the "Current Temperature" characteristic
   */
  handleCurrentTemperatureGet() {
    const zone_status = this.zone.zone_status!;
    if(+zone_status.zone_has_sensor === 1) {
      return this.zone.zone_status!.zone_temp;
    } else {
      return this.ac.ac_status!.ac_temp;
    }
  }

  /**
   * Handle requests to get the current value of the "Current Temperature" characteristic
   */
  handleTargetTemperatureGet() {
    const zone_status = this.zone.zone_status!;
    if(+zone_status.zone_has_sensor === 1) {
      return this.zone.zone_status!.zone_target;
    } else {
      return this.ac.ac_status!.ac_target;
    }
  }

  /**
   * Handle requests to get the current value of the "Current Temperature" characteristic
   */
  handleTargetTemperatureSet(value) {
    this.log.debug('Zone setting target temperature to: '+value);
    if(+this.zone.zone_status!.zone_has_sensor === 1) {
      this.api.zoneSetTargetTemperature(+this.zone.zone_number, +value);
    } else {
      this.api.acSetTargetTemperature(+this.ac.ac_number, +value);
    }
    this.log.debug('Setting target temperature:'+value);
  }
}