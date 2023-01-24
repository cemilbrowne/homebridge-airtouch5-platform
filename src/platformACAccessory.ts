import { Service, PlatformAccessory } from 'homebridge';

import { AirtouchPlatform } from './platform';

import { MAGIC } from './magic';

export class AirTouchACAccessory {
  private service: Service;
  // private fanService: Service;
  AirtouchId;
  ACNumber;
  minTemp: number;
  maxTemp: number;
  step: number;
  constructor(
    private readonly platform: AirtouchPlatform,
    private readonly accessory: PlatformAccessory,
    AirtouchId,
    ACNumber,
  ) {
    this.AirtouchId = AirtouchId;
    this.ACNumber = ACNumber;
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


    // this.fanService = this.accessory.getService(this.platform.Service.Fanv2) ||
    //   this.accessory.addService(this.platform.Service.Fanv2);

    // // create handlers for required characteristics
    // this.fanService.getCharacteristic(this.platform.Characteristic.Active)
    //   .onGet(this.handleFanActiveGet.bind(this))
    //   .onSet(this.handleFanActiveSet.bind(this));
  }

  handleActiveGet() {
    const currentValue = this.platform.getACAttribute(this.AirtouchId, this.ACNumber, MAGIC.ATTR_AC_ACTIVE);
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
    const name = this.isNull(this.platform.getACAttribute(this.AirtouchId, this.ACNumber, MAGIC.ATTR_NAME), 'Default Name');
    return name;
  }

  /**
   * Handle requests to get the current value of the "Current Heater-Cooler State" characteristic
   */
  handleCurrentHeaterCoolerStateGet() {

    const currentValue = this.platform.getACAttribute(this.AirtouchId, this.ACNumber, MAGIC.ATTR_CURRENT_HEATCOOL);
    return currentValue;
  }


  /**
   * Handle requests to get the current value of the "Target Heater-Cooler State" characteristic
   */
  handleTargetHeaterCoolerStateGet() {

    const currentValue = this.platform.getACAttribute(this.AirtouchId, this.ACNumber, MAGIC.ATTR_TARGET_HEATCOOL);
    return currentValue;
  }

  /**
   * Handle requests to set the "Target Heater-Cooler State" characteristic
   */
  handleTargetHeaterCoolerStateSet(value) {
    // this.platform.setZoneAttribute(this.AirtouchId, this.ZoneNumber, MAGIC.ATTR_TARGET_HEATCOOL, value);
  }

  /**
   * Handle requests to get the current value of the "Current Temperature" characteristic
   */
  handleCurrentTemperatureGet() {

    const currentValue = this.platform.getACAttribute(this.AirtouchId, this.ACNumber, MAGIC.ATTR_CURRENT_TEMP);
    return currentValue;
  }

}