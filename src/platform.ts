import { API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service, Characteristic } from 'homebridge';
import { PLATFORM_NAME, PLUGIN_NAME } from './settings';
import { AirtouchAPI, AcAbility, AcStatus, ZoneStatus } from './api';
import { AirTouchZoneAccessory } from './platformAccessory';
import { EventEmitter } from 'events';
import { MAGIC } from './magic';


interface AC {
  ac_number: number;
  ac_ability: AcAbility;
  ac_status?: AcStatus;
}

class Airtouch5Wrapper {
  //
  // Helper class for wrapping an Airtouch5.  Maintains the mapping of controller -> ac -> zones.
  //

  ip: string;
  consoleId: string;
  AirtouchId: string;
  deviceName: string;
  api: AirtouchAPI;
  acs: Array<AC>;
  log: Logger;
  emitter: EventEmitter;
  zones: Array<ZoneStatus>;

  zoneMapping: Array<number>;
  accessories: Array<AirTouchZoneAccessory>;

  constructor(ip: string, consoleId: string, AirtouchId: string, deviceName: string, log: Logger, emitter: EventEmitter) {
    this.ip = ip;
    this.log = log;
    this.consoleId = consoleId;
    this.AirtouchId = AirtouchId;
    this.deviceName = deviceName;
    this.emitter = emitter;
    this.api = new AirtouchAPI(ip, consoleId, AirtouchId, deviceName, log, emitter);
    this.api.connect();
    this.acs = new Array<AC>();
    this.zones = new Array<ZoneStatus>(16);
    this.zoneMapping = Array(16).fill(-1);
    this.accessories = new Array<AirTouchZoneAccessory>(16);
  }

  AddAcAbility(ac_ability: AcAbility) {
    const new_ac_number = +ac_ability.ac_unit_number;
    const result = this.acs.find(({ ac_number }) => ac_number === new_ac_number);
    if(result === undefined) {
      this.acs.push({
        ac_number: new_ac_number,
        ac_ability: ac_ability,
      });
      const zonestart: number = +ac_ability.ac_start_zone;
      const count_zones:number = +ac_ability.ac_zone_count;
      for (let i:number = zonestart; i<(zonestart+count_zones); i++) {
        this.zoneMapping[i] = new_ac_number;
      }
    } else {
      this.log.debug('Adding AC Capability, but AC Number was already there: ', new_ac_number);
    }
  }

  AddUpdateZoneStatus(zone_status: ZoneStatus) {
    const zone_number = parseInt(zone_status.zone_number);
    this.zones[zone_number] = zone_status;
    this.log.debug('Updated zone: '+zone_number);
  }

  AddZoneName(in_zone_number, zone_name) {
    const zone_number = +in_zone_number;
    if(this.zones[zone_number].zone_name == null) {
      this.zones[zone_number].zone_name = zone_name;
      this.emitter.emit('zone_added', zone_number, this.AirtouchId);
    } else {
      this.zones[zone_number].zone_name = zone_name;
    }
    this.log.debug('Updated zone name: '+zone_name);
  }

  AddUpdateAcStatus(ac_status: AcStatus) {
    const new_ac_number = +ac_status.ac_unit_number;
    const result = this.acs.find(({ ac_number }) => ac_number === new_ac_number);
    if(result === undefined) {
      this.log.debug('Error condition adding AC Status - no existing AC with abilities with num: ', new_ac_number);
    } else {
      result.ac_status = ac_status;
    }
  }
}

export class AirtouchPlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service = this.api.hap.Service;
  public readonly Characteristic: typeof Characteristic = this.api.hap.Characteristic;
  public readonly accessories: string[] = [];
  public emitter: EventEmitter;
  airtouch_devices: Array<Airtouch5Wrapper>;
  //
  // Airtouch platform
  // Homebridge platform which creates accessories for AC units and AC zones
  // Handles communication with the Airtouch Touchpad Controller using the Airtouch API
  //
  constructor (
    public readonly log: Logger,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {
    this.airtouch_devices = new Array<Airtouch5Wrapper>();
    this.log.debug('Starting to set up Airtouch5 platform.');
    this.emitter = new EventEmitter();
    // initialize accessory lists
    // set up callbacks from API
    // this.airtouch = new AirtouchAPI(input_log);
    // this.airtouch.on('ac_status', (ac_status) => {
    //   this.onACStatusNotification(ac_status);
    // });
    // this.airtouch.on('groups_status', (zone_status) => {
    //   this.onGroupsStatusNotification(zone_status);
    // });


    // will try to reconnect on api error - worried this might end up causing a loop..
    // this.api.on("attempt_reconnect", () => {
    // 	this.api.connect(config.ip_address);
    // });

    // // connect to the Airtouch Touchpad Controller
    // this.api.connect(config.ip_address);

    this.api.on('didFinishLaunching', () => {
      this.log.debug('Executed didFinishLaunching callback');
      // run the method to discover / register your devices as accessories
      this.discoverDevices();
    });
    this.emitter.on('ac_status', (ac_status, in_AirtouchId) => {
      this.onACStatusNotification(ac_status, in_AirtouchId);
    });
    this.emitter.on('zone_status', (zone_status, in_AirtouchId) => {
      this.onZoneStatusNotification(zone_status, in_AirtouchId);
    });
    this.emitter.on('ac_ability', (ac_ability, in_AirtouchId) => {
      this.onACAbilityNotification(ac_ability, in_AirtouchId);
    });
    this.emitter.on('zone_name', (zone_number, zone_name, in_AirtouchId) => {
      this.onZoneNameNotification(zone_number, zone_name, in_AirtouchId);
    });

    this.emitter.on('zone_added', (zone_number, in_AirtouchId) => {
      this.onZoneAddedNotification(zone_number, in_AirtouchId);
    });

  }

  discoverDevices() {

    if (this.config.units?.length) {
      this.log.debug('Defined units in config, not doing automated discovery');
      this.config.units.forEach(ip=>this.addAirtouchDevice(ip, 'console-'+ip, 'airtouchid-'+ip, 'device-'+ip));
      return;
    }
    this.emitter.on('found_devices', (ip: string, consoleId: string, AirtouchId: string, deviceName: string) => {
      this.log.debug('Got an AirTouch5 device from dicovery.  Adding it and finding zones: ', ip, consoleId, AirtouchId, deviceName);
      this.addAirtouchDevice(ip, consoleId, AirtouchId, deviceName);
    });

    AirtouchAPI.discoverDevices(this.log, this.emitter);

  }

  addAirtouchDevice(in_ip: string, consoleId: string, in_AirtouchId: string, deviceName: string) {
    const result = this.airtouch_devices.find(({ AirtouchId }) => AirtouchId === in_AirtouchId);
    if(result === undefined) {
      const newAirtouch = new Airtouch5Wrapper(in_ip, consoleId, in_AirtouchId, deviceName, this.log, this.emitter);
      this.airtouch_devices.push(newAirtouch);
      this.log.debug('Did not find this ip, so added it: ', in_ip);
    } else {
      this.log.debug('IP Address was already in array: ', in_ip);
    }

  }

  onACStatusNotification(ac_status, in_AirtouchId) {
    const result = this.airtouch_devices.find(({ AirtouchId }) => AirtouchId === in_AirtouchId);
    if(result === undefined) {
      this.log.debug('Error condition in AC Status, no AirTouch ID found', in_AirtouchId);
    } else {
      result.AddUpdateAcStatus(ac_status);
    }
  }

  onZoneStatusNotification(zone_status, in_AirtouchId) {
    const result = this.airtouch_devices.find(({ AirtouchId }) => AirtouchId === in_AirtouchId);
    if(result === undefined) {
      this.log.debug('Error condition in Zone Status, no AirTouch ID found', in_AirtouchId);
    } else {
      result.AddUpdateZoneStatus(zone_status);
      if(result.accessories[zone_status.zone_number]) {
        result.accessories[zone_status.zone_number].updateAll();
      }
    }
  }

  onZoneNameNotification(zone_number, zone_name, in_AirtouchId) {
    const result = this.airtouch_devices.find(({ AirtouchId }) => AirtouchId === in_AirtouchId);
    if(result === undefined) {
      this.log.debug('Error condition in Zone Status, no AirTouch ID found', in_AirtouchId);
    } else {
      result.AddZoneName(zone_number, zone_name);
    }
  }

  onACAbilityNotification(ac_ability, in_AirtouchId) {
    const result = this.airtouch_devices.find(({ AirtouchId }) => AirtouchId === in_AirtouchId);
    if(result === undefined) {
      this.log.debug('Error condition in AC Ability, no AirTouch ID found', in_AirtouchId);
    } else {
      result.AddAcAbility(ac_ability);
    }
  }

  onZoneAddedNotification(zone_number, in_AirtouchId) {
    const result = this.airtouch_devices.find(({ AirtouchId }) => AirtouchId === in_AirtouchId);
    if(result === undefined) {
      this.log.debug('Error condition in Zone Added Notification:', in_AirtouchId);
      return;
    }
    const zone = result.zones[zone_number];

    const uuid = this.api.hap.uuid.generate(''+result.AirtouchId+zone.zone_number);
    if(this.accessories.find(element => element === uuid)) {
      this.log.debug('Tried to add existing UUID, backing out');
      return;
    }
    // create a new accessory
    const accessory = new this.api.platformAccessory(''+ zone.zone_name!, uuid);

    accessory.context.ZoneNumber = zone_number;
    accessory.context.AirtouchId = in_AirtouchId;

    // create the accessory handler for the newly create accessory
    // this is imported from `platformAccessory.ts`
    result.accessories[zone.zone_number] = new AirTouchZoneAccessory(this, accessory, in_AirtouchId, zone_number);

    // link the accessory to your platform
    this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
  }

  getZoneAttribute(in_AirtouchId, zone_number:number, attribute: string): any {
    const result = this.airtouch_devices.find(({ AirtouchId }) => AirtouchId === in_AirtouchId);
    if(result === undefined) {
      this.log.debug('Error getting the airtouch device in getzoneattribute:', in_AirtouchId);
      return;
    }
    const zone = result.zones[zone_number];
    const power_state = parseInt(zone.zone_power_state);
    switch(attribute) {
      case MAGIC.ATTR_NAME:
        return zone.zone_name;
        break;
      case MAGIC.ATTR_ZONE_POWER:
        switch(parseInt(zone.zone_power_state)) {
          case 0:
            return this.api.hap.Characteristic.Active.INACTIVE;
            break;
          case 1:
            return this.api.hap.Characteristic.Active.ACTIVE;
            break;
          default:
            return this.api.hap.Characteristic.Active.INACTIVE;
            break;
        }
        break;
      case MAGIC.ATTR_CURRENT_HEATCOOL:
        return this.getCurrentHeatingCoolingState(zone, result);
        break;
      case MAGIC.ATTR_TARGET_HEATCOOL:
        return this.getTargetHeatingCoolingState(zone, result);
        break;
      case MAGIC.ATTR_CURRENT_TEMP:
        return +zone.zone_temp;
        break;
      case MAGIC.ATTR_TARGET_TEMP:
        return +zone.zone_target;
        break;
    }
  }

  setZoneAttribute(in_AirtouchId, zone_number:number, attribute: string, value: any): any {
    const result = this.airtouch_devices.find(({ AirtouchId }) => AirtouchId === in_AirtouchId);
    if(result === undefined) {
      this.log.debug('Error getting the airtouch device in setzoneattribute:', in_AirtouchId);
      return;
    }
    const zone = result.zones[zone_number];
    switch(attribute) {
      case MAGIC.ATTR_TARGET_HEATCOOL:
        this.setTargetHeatingCoolingState(zone, result, value);
        break;
      case MAGIC.ATTR_TARGET_TEMP:
        this.setTargetTemperature(zone, result, value);
        break;
    }
  }

  setTargetHeatingCoolingState(zone: ZoneStatus, AirTouchWrapper: Airtouch5Wrapper, value: any) {
    switch(value) {
      case this.api.hap.Characteristic.TargetHeatingCoolingState.OFF:
        AirTouchWrapper.api.zoneSetActive(+zone.zone_number, false);
        break;
      case this.api.hap.Characteristic.TargetHeatingCoolingState.COOL:
        AirTouchWrapper.api.zoneSetActive(+zone.zone_number, true);
        AirTouchWrapper.api.acSetTargetHeatingCoolingState(AirTouchWrapper.zoneMapping[+zone.zone_number], MAGIC.AC_TARGET_STATES.COOL);
        break;
      case this.api.hap.Characteristic.TargetHeatingCoolingState.HEAT:
        AirTouchWrapper.api.zoneSetActive(+zone.zone_number, true);
        AirTouchWrapper.api.acSetTargetHeatingCoolingState(AirTouchWrapper.zoneMapping[+zone.zone_number], MAGIC.AC_TARGET_STATES.HEAT);
        break;
      case this.api.hap.Characteristic.TargetHeatingCoolingState.AUTO:
        AirTouchWrapper.api.zoneSetActive(+zone.zone_number, true);
        AirTouchWrapper.api.acSetTargetHeatingCoolingState(AirTouchWrapper.zoneMapping[+zone.zone_number], MAGIC.AC_TARGET_STATES.AUTO);
        break;
    }
    this.log.debug('Setting target heating cooling state, value='+value);
  }

  setTargetTemperature(zone: ZoneStatus, AirTouchWrapper: Airtouch5Wrapper, value: any) {
    AirTouchWrapper.api.zoneSetTargetTemperature(+zone.zone_number, +value);
    this.log.debug('Setting target temperature:'+value);
  }

  getCurrentHeatingCoolingState(zone: ZoneStatus, AirTouchWrapper: Airtouch5Wrapper) {
    const my_ac_num = AirTouchWrapper.zoneMapping[+zone.zone_number];
    const ac_mode = +AirTouchWrapper.acs[my_ac_num].ac_status!.ac_mode;
    const power_state = parseInt(zone.zone_power_state);
    if(power_state === 0){
      return this.api.hap.Characteristic.CurrentHeatingCoolingState.OFF;
    } else {
      if(+zone.zone_damper_position === 0) {
        return this.api.hap.Characteristic.CurrentHeatingCoolingState.OFF;
      }
      const zone_target = +zone.zone_target;
      const zone_current = +zone.zone_temp;
      switch(ac_mode) {
        case 0:
          this.log.debug('AC is set to AUTO mode and zone is on.  Interpreting response. target: '+zone_target+'. current: '+zone_current);
          if(zone_target < zone_current) {
            return this.api.hap.Characteristic.CurrentHeatingCoolingState.COOL;
          } else {
            return this.api.hap.Characteristic.CurrentHeatingCoolingState.HEAT;
          }
          break;
        case 1:
          return this.api.hap.Characteristic.CurrentHeatingCoolingState.HEAT;
          break;
        case 2:
          this.log.info('AC is set to DRY mode.  This is currently unhandled.  Reporting it as cool instead. ');
          return this.api.hap.Characteristic.CurrentHeatingCoolingState.COOL;
          break;
        case 3:
          this.log.info('AC is set to FAN mode.  This is currently unhandled.  Reporting it as cool instead. ');
          return this.api.hap.Characteristic.CurrentHeatingCoolingState.COOL;
          break;
        case 4:
          return this.api.hap.Characteristic.CurrentHeatingCoolingState.COOL;
          break;
        case 8:
          return this.api.hap.Characteristic.CurrentHeatingCoolingState.HEAT;
          break;
        case 9:
          return this.api.hap.Characteristic.CurrentHeatingCoolingState.COOL;
          break;
        default:
          this.log.info('Unhandled ac_mode in getCurrentHeatingCoolingState. Returning off as fail safe.');
          return this.api.hap.Characteristic.CurrentHeatingCoolingState.OFF;
          break;
      }
    }
  }

  getTargetHeatingCoolingState(zone: ZoneStatus, AirTouchWrapper: Airtouch5Wrapper) {
    const my_ac_num = AirTouchWrapper.zoneMapping[+zone.zone_number];
    const ac_mode = +AirTouchWrapper.acs[my_ac_num].ac_status!.ac_mode;
    const power_state = parseInt(zone.zone_power_state);
    if(power_state === 0){
      return this.api.hap.Characteristic.TargetHeatingCoolingState.OFF;
    } else {
      switch(ac_mode) {
        case 0:
          return this.api.hap.Characteristic.TargetHeatingCoolingState.AUTO;
          break;
        case 1:
          return this.api.hap.Characteristic.TargetHeatingCoolingState.HEAT;
          break;
        case 2:
          this.log.info('AC is set to DRY mode.  This is currently unhandled.  Reporting it as cool instead. ');
          return this.api.hap.Characteristic.TargetHeatingCoolingState.COOL;
          break;
        case 3:
          this.log.info('AC is set to FAN mode.  This is currently unhandled.  Reporting it as cool instead. ');
          return this.api.hap.Characteristic.TargetHeatingCoolingState.COOL;
          break;
        case 4:
          return this.api.hap.Characteristic.TargetHeatingCoolingState.COOL;
          break;
        case 8:
          return this.api.hap.Characteristic.TargetHeatingCoolingState.HEAT;
          break;
        case 9:
          return this.api.hap.Characteristic.TargetHeatingCoolingState.COOL;
          break;
        default:
          this.log.info('Unhandled ac_mode in getCurrentHeatingCoolingState. Returning off as fail safe.');
          return this.api.hap.Characteristic.TargetHeatingCoolingState.OFF;
          break;
      }
    }
  }

  // configure cached accessories
  configureAccessory(accessory) {
    this.log.info('Loading accessory from cache:', accessory.displayName);

    // add the restored accessory to the accessories cache so we can track if it has already been registered
    this.accessories.push(accessory);

    // if (accessory.displayName in this.units || accessory.displayName in this.zones) {
    //   this.log('[' + accessory.displayName + '] is already configured');
    //   return;
    // }

    // accessory.reacheable = false;
    // accessory.log = this.log;
    // accessory.api = this.airtouch;

    // if (accessory.displayName.startsWith('AC')) {
    //   this.setupACAccessory(accessory);
    //   this.units[accessory.displayName] = accessory;
    // } else if (accessory.displayName.startsWith('Zone') && accessory.displayName.endsWith('Thermostat')) {
    //   this.setupThermoAccessory(accessory);
    //   this.thermostats[accessory.displayName] = accessory;
    // } else if (accessory.displayName.startsWith('Zone')) {
    //   this.setupZoneAccessory(accessory);
    //   this.zones[accessory.displayName] = accessory;
    // }

    // this.log('[' + accessory.displayName + '] was restored from cache and should be reachable');
  }
}


