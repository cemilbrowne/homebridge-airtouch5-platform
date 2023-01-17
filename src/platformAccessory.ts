import { Service, PlatformAccessory, CharacteristicValue } from 'homebridge';

import { AirtouchPlatform } from './platform';

import { MAGIC } from './magic';

export class AirTouchZoneAccessory {
  private service: Service;
  AirtouchId;
  ZoneNumber;
  constructor(
    private readonly platform: AirtouchPlatform,
    private readonly accessory: PlatformAccessory,
    AirtouchId,
    ZoneNumber,
  ) {
    this.AirtouchId = AirtouchId;
    this.ZoneNumber = ZoneNumber;

    this.platform.log.debug('Creating a platform accessory');

    this.service = this.accessory.getService(this.platform.Service.Thermostat) ||
                    this.accessory.addService(this.platform.Service.Thermostat);

    this.service.getCharacteristic(this.platform.Characteristic.CurrentHeatingCoolingState)
      .onGet(this.handleCurrentHeatingCoolingStateGet.bind(this));

    this.service.getCharacteristic(this.platform.Characteristic.TargetHeatingCoolingState)
      .onGet(this.handleTargetHeatingCoolingStateGet.bind(this))
      .onSet(this.handleTargetHeatingCoolingStateSet.bind(this));

    this.service.getCharacteristic(this.platform.Characteristic.CurrentTemperature)
      .onGet(this.handleCurrentTemperatureGet.bind(this));

    this.service.getCharacteristic(this.platform.Characteristic.TargetTemperature)
      .onGet(this.handleTargetTemperatureGet.bind(this));

    this.service.getCharacteristic(this.platform.Characteristic.Name)
      .onGet(this.handleNameGet.bind(this));



  }

  /**
   * Handle requests to get the current value of the "Name" characteristic
   */
  handleNameGet() {
    const name = this.platform.getZoneAttribute(this.AirtouchId, this.ZoneNumber, MAGIC.ATTR_NAME);
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

    const currentValue = this.platform.getZoneAttribute(this.AirtouchId, this.ZoneNumber, MAGIC.ATTR_CURRENT_HEATCOOL);

    return currentValue;
  }

  /**
   * Handle requests to set the "Target Heater-Cooler State" characteristic
   */
  handleTargetHeatingCoolingStateSet(value) {
    this.platform.log.debug('Triggered SET TargetHeaterCoolerState:', value);
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

}