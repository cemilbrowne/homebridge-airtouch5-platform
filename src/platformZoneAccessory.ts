import { Service, PlatformAccessory } from 'homebridge';

import { AirtouchPlatform } from './platform';

import { MAGIC } from './magic';

export class AirTouchZoneAccessory {
  private service: Service;
  // private fanService: Service;
  AirtouchId;
  ZoneNumber;
  minTemp: number;
  maxTemp: number;
  step: number;
  constructor(
    private readonly platform: AirtouchPlatform,
    private readonly accessory: PlatformAccessory,
    AirtouchId,
    ZoneNumber,
  ) {
    this.AirtouchId = AirtouchId;
    this.ZoneNumber = ZoneNumber;
    this.minTemp = 15;
    this.maxTemp = 30;
    this.step = 1;

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
    // this.fanService = this.accessory.getService(this.platform.Service.Fanv2) ||
    //   this.accessory.addService(this.platform.Service.Fanv2);

    // // create handlers for required characteristics
    // this.fanService.getCharacteristic(this.platform.Characteristic.Active)
    //   .onGet(this.handleFanActiveGet.bind(this))
    //   .onSet(this.handleFanActiveSet.bind(this));
  }

  handleRotationSpeedGet() {
    const currentValue = this.platform.getZoneAttribute(this.AirtouchId, this.ZoneNumber, MAGIC.ATTR_ZONE_PERCENTAGE);
    return currentValue;
  }

  handleActiveGet() {
    const currentValue = this.platform.getZoneAttribute(this.AirtouchId, this.ZoneNumber, MAGIC.ATTR_ZONE_POWER);
    return currentValue;
  }

  handleActiveSet(value) {
    // this.platform.log.debug('SHould set Fan active to: '+value);
  }


  // check if value is undefined, and replace it with a default value
  isNull(val, nullVal) {
    return val === undefined ? nullVal : val;
  }

  updateAll() {
    // this.service.getCharacteristic(this.platform.Characteristic.TargetHeatingCoolingState)
    //   .updateValue(this.handleTargetHeatingCoolingStateGet());
    // this.service.getCharacteristic(this.platform.Characteristic.CurrentHeatingCoolingState)
    //   .updateValue(this.handleCurrentHeatingCoolingStateGet());
    // this.service.getCharacteristic(this.platform.Characteristic.CurrentTemperature)
    //   .updateValue(this.handleCurrentTemperatureGet());
    // this.service.getCharacteristic(this.platform.Characteristic.TargetTemperature)
    //   .updateValue(this.handleTargetTemperatureGet());
  }

  /**
   * Handle requests to get the current value of the "Name" characteristic
   */
  handleNameGet() {
    const name = this.isNull(this.platform.getZoneAttribute(this.AirtouchId, this.ZoneNumber, MAGIC.ATTR_NAME), 'Default Name');
    return name;
  }

  /**
   * Handle requests to get the current value of the "Current Heater-Cooler State" characteristic
   */
  handleCurrentHeatingCoolingStateGet() {

    const currentValue = this.platform.getZoneAttribute(this.AirtouchId, this.ZoneNumber, MAGIC.ATTR_CURRENT_HEATCOOL);

    return currentValue;
  }


  /**
   * Handle requests to get the current value of the "Target Heater-Cooler State" characteristic
   */
  handleTargetHeatingCoolingStateGet() {

    const currentValue = this.platform.getZoneAttribute(this.AirtouchId, this.ZoneNumber, MAGIC.ATTR_TARGET_HEATCOOL);

    return currentValue;
  }

  /**
   * Handle requests to set the "Target Heater-Cooler State" characteristic
   */
  handleTargetHeatingCoolingStateSet(value) {
    this.platform.setZoneAttribute(this.AirtouchId, this.ZoneNumber, MAGIC.ATTR_TARGET_HEATCOOL, value);
  }

  /**
   * Handle requests to get the current value of the "Current Temperature" characteristic
   */
  handleCurrentTemperatureGet() {

    const currentValue = this.platform.getZoneAttribute(this.AirtouchId, this.ZoneNumber, MAGIC.ATTR_CURRENT_TEMP);

    return currentValue;
  }

  /**
   * Handle requests to get the current value of the "Current Temperature" characteristic
   */
  handleTargetTemperatureGet() {
    const currentValue = this.platform.getZoneAttribute(this.AirtouchId, this.ZoneNumber, MAGIC.ATTR_TARGET_TEMP);

    return currentValue;
  }

  /**
   * Handle requests to get the current value of the "Current Temperature" characteristic
   */
  handleTargetTemperatureSet(value) {
    this.platform.setZoneAttribute(this.AirtouchId, this.ZoneNumber, MAGIC.ATTR_TARGET_TEMP, value);
  }
}