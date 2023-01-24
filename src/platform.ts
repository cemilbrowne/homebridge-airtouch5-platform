import { API, DynamicPlatformPlugin, Logger, PlatformConfig, Service, Characteristic } from 'homebridge';
import { PLATFORM_NAME, PLUGIN_NAME } from './settings';
import { AirtouchAPI, ZoneStatus } from './api';
import { AirTouchZoneAccessory } from './platformZoneAccessory';
import { EventEmitter } from 'events';
import { MAGIC } from './magic';
import { Airtouch5Wrapper, AC } from './airTouchWrapper';



export class AirtouchPlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service = this.api.hap.Service;
  public readonly Characteristic: typeof Characteristic = this.api.hap.Characteristic;
  // public readonly zoneAccessories: string[] = [];
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
      const newAirtouch = new Airtouch5Wrapper(in_ip, consoleId, in_AirtouchId, deviceName, this.log, this.emitter, this);
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
      if(result.zoneAccessories[zone_status.zone_number]) {
        result.zoneAccessories[zone_status.zone_number].updateAll();
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
    if(result.zoneAccessories[zone.zone_number]) {
      this.log.debug('Tried to add existing UUID, backing out');
      return;
    }
    // create a new accessory
    const accessory = new this.api.platformAccessory(''+ zone.zone_name!, uuid);

    accessory.context.ZoneNumber = zone_number;
    accessory.context.AirtouchId = in_AirtouchId;

    // create the accessory handler for the newly create accessory
    // this is imported from `platformAccessory.ts`
    result.zoneAccessories[zone.zone_number] = new AirTouchZoneAccessory(this, accessory, in_AirtouchId, zone_number);

    // link the accessory to your platform
    this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
  }

  getACAttribute(in_AirtouchId, in_ac_number:number, attribute: string): any {
    const result = this.airtouch_devices.find(({ AirtouchId }) => AirtouchId === in_AirtouchId);
    if(result === undefined) {
      this.log.debug('Error getting the airtouch device in getzoneattribute:', in_AirtouchId);
      return;
    }
    const ac = result.acs.find(({ ac_number }) => ac_number === in_ac_number);
    switch(attribute) {
      case MAGIC.ATTR_NAME:
        return ac!.ac_ability.ac_name;
        break;
      case MAGIC.ATTR_AC_ACTIVE:
        switch(parseInt(ac!.ac_status!.ac_power_state)) {
          case 0:
            return this.api.hap.Characteristic.Active.INACTIVE;
            break;
          case 1:
            return this.api.hap.Characteristic.Active.ACTIVE;
            break;
          case 2:
            return this.api.hap.Characteristic.Active.INACTIVE;
            break;
          case 3:
            return this.api.hap.Characteristic.Active.ACTIVE;
            break;
          default:
            return this.api.hap.Characteristic.Active.INACTIVE;
            break;
        }
      case MAGIC.ATTR_CURRENT_HEATCOOL:
        return this.getCurrentACHeatingCoolingState(ac!);
        break;
      case MAGIC.ATTR_TARGET_HEATCOOL:
        return this.getTargetACHeatingCoolingState(ac!);
        break;
      case MAGIC.ATTR_CURRENT_TEMP:
        return +ac!.ac_status!.ac_temp;
        break;
    }
  }

  getCurrentACHeatingCoolingState(ac: AC) {
    const ac_mode = +ac.ac_status!.ac_mode;
    const power_state = parseInt(ac.ac_status!.ac_power_state);
    if(power_state === 0){
      this.log.debug('Returning inactive status for state of AC');
      return this.api.hap.Characteristic.CurrentHeaterCoolerState.INACTIVE;
    } else {
      const ac_target = +ac.ac_status!.ac_target;
      const ac_current = +ac.ac_status!.ac_temp;
      switch(ac_mode) {
        case 0:
          this.log.debug('AC is set to AUTO mode and zone is on.  Interpreting response. target: '+ac_target+'. current: '+ac_current);
          if(ac_target < ac_current) {
            return this.api.hap.Characteristic.CurrentHeaterCoolerState.COOLING;
          } else {
            return this.api.hap.Characteristic.CurrentHeaterCoolerState.HEATING;
          }
          break;
        case 1:
          return this.api.hap.Characteristic.CurrentHeaterCoolerState.HEATING;
          break;
        case 2:
          this.log.info('AC is set to DRY mode.  This is currently unhandled.  Reporting it as cool instead. ');
          return this.api.hap.Characteristic.CurrentHeaterCoolerState.COOLING;
          break;
        case 3:
          this.log.info('AC is set to FAN mode.  This is currently unhandled.  Reporting it as cool instead. ');
          return this.api.hap.Characteristic.CurrentHeaterCoolerState.COOLING;
          break;
        case 4:
          return this.api.hap.Characteristic.CurrentHeaterCoolerState.COOLING;
          break;
        case 8:
          return this.api.hap.Characteristic.CurrentHeaterCoolerState.HEATING;
          break;
        case 9:
          return this.api.hap.Characteristic.CurrentHeaterCoolerState.COOLING;
          break;
        default:
          this.log.info('Unhandled ac_mode in getCurrentHeatingCoolingState. Returning off as fail safe.');
          return this.api.hap.Characteristic.CurrentHeaterCoolerState.IDLE;
          break;
      }
    }
  }

  getTargetACHeatingCoolingState(ac: AC) {
    const ac_mode = +ac.ac_status!.ac_mode;
    switch(ac_mode) {
      case 0:
        return this.api.hap.Characteristic.TargetHeaterCoolerState.AUTO;
        break;
      case 1:
        return this.api.hap.Characteristic.TargetHeaterCoolerState.HEAT;
        break;
      case 2:
        this.log.info('AC is set to DRY mode.  This is currently unhandled.  Reporting it as cool instead. ');
        return this.api.hap.Characteristic.TargetHeaterCoolerState.COOL;
        break;
      case 3:
        this.log.info('AC is set to FAN mode.  This is currently unhandled.  Reporting it as cool instead. ');
        return this.api.hap.Characteristic.TargetHeaterCoolerState.COOL;
        break;
      case 4:
        return this.api.hap.Characteristic.TargetHeaterCoolerState.COOL;
        break;
      case 8:
        return this.api.hap.Characteristic.TargetHeaterCoolerState.HEAT;
        break;
      case 9:
        return this.api.hap.Characteristic.TargetHeaterCoolerState.COOL;
        break;
      default:
        this.log.info('Unhandled ac_mode in getTargetACHeatingCooling. Returning auto as fail safe.');
        return this.api.hap.Characteristic.TargetHeaterCoolerState.AUTO;
        break;
    }
  }

  getZoneAttribute(in_AirtouchId, zone_number:number, attribute: string): any {
    const result = this.airtouch_devices.find(({ AirtouchId }) => AirtouchId === in_AirtouchId);
    if(result === undefined) {
      this.log.debug('Error getting the airtouch device in getzoneattribute:', in_AirtouchId);
      return;
    }
    const zone = result.zones[zone_number];
    const my_ac_num = result.zoneMapping[+zone.zone_number];
    const ac_status = result.acs[my_ac_num].ac_status!;
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
        if(+zone.zone_has_sensor === 1) {
          return +zone.zone_temp;
        } else {
          return +ac_status.ac_temp;
        }
        break;
      case MAGIC.ATTR_TARGET_TEMP:
        return +zone.zone_target;
        break;
      case MAGIC.ATTR_ZONE_PERCENTAGE:
        return +zone.zone_damper_position;
        break;
    }
  }

  setZoneAttribute(in_AirtouchId, zone_number:number, attribute: string, value) {
    const result = this.airtouch_devices.find(({ AirtouchId }) => AirtouchId === in_AirtouchId);
    if(result === undefined) {
      this.log.debug('Error getting the airtouch device in setzoneattribute:', in_AirtouchId);
      return;
    }
    const zone = result.zones[zone_number];
    switch(attribute) {
      case MAGIC.ATTR_ZONE_POWER:
        this.setZoneActive(zone, result, value);
        break;
      case MAGIC.ATTR_TARGET_HEATCOOL:
        this.setTargetHeatingCoolingState(zone, result, value);
        break;
      case MAGIC.ATTR_TARGET_TEMP:
        this.setTargetTemperature(zone, result, value);
        break;
    }
  }

  setZoneActive(zone: ZoneStatus, AirTouchWrapper: Airtouch5Wrapper, value) {
    switch(value) {
      case this.api.hap.Characteristic.Active.INACTIVE:
        AirTouchWrapper.api.zoneSetActive(+zone.zone_number, false);
        break;
      case this.api.hap.Characteristic.Active.ACTIVE:
        AirTouchWrapper.api.zoneSetActive(+zone.zone_number, true);
        break;
    }
    this.log.debug('Setting active state, value='+value);
  }

  setTargetHeatingCoolingState(zone: ZoneStatus, AirTouchWrapper: Airtouch5Wrapper, value) {
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

  setTargetTemperature(zone: ZoneStatus, AirTouchWrapper: Airtouch5Wrapper, value) {
    AirTouchWrapper.api.zoneSetTargetTemperature(+zone.zone_number, +value);
    this.log.debug('Setting target temperature:'+value);
  }

  getCurrentHeatingCoolingState(zone: ZoneStatus, AirTouchWrapper: Airtouch5Wrapper) {
    const my_ac_num = AirTouchWrapper.zoneMapping[+zone.zone_number];
    const ac_mode = +AirTouchWrapper.acs[my_ac_num].ac_status!.ac_mode;
    const power_state = parseInt(zone.zone_power_state);
    if(power_state === 0){
      return this.api.hap.Characteristic.CurrentHeaterCoolerState.INACTIVE;
    } else {
      if(+zone.zone_damper_position === 0) {
        return this.api.hap.Characteristic.CurrentHeaterCoolerState.INACTIVE;
      }
      const zone_target = +zone.zone_target;
      const zone_current = +zone.zone_temp;
      switch(ac_mode) {
        case 0:
          this.log.debug('AC is set to AUTO mode and zone is on.  Interpreting response. target: '+zone_target+'. current: '+zone_current);
          if(zone_target < zone_current) {
            return this.api.hap.Characteristic.CurrentHeaterCoolerState.COOLING;
          } else {
            return this.api.hap.Characteristic.CurrentHeaterCoolerState.HEATING;
          }
          break;
        case 1:
          return this.api.hap.Characteristic.CurrentHeaterCoolerState.HEATING;
          break;
        case 2:
          this.log.info('AC is set to DRY mode.  This is currently unhandled.  Reporting it as cool instead. ');
          return this.api.hap.Characteristic.CurrentHeaterCoolerState.COOLING;
          break;
        case 3:
          this.log.info('AC is set to FAN mode.  This is currently unhandled.  Reporting it as cool instead. ');
          return this.api.hap.Characteristic.CurrentHeaterCoolerState.COOLING;
          break;
        case 4:
          return this.api.hap.Characteristic.CurrentHeaterCoolerState.COOLING;
          break;
        case 8:
          return this.api.hap.Characteristic.CurrentHeaterCoolerState.HEATING;
          break;
        case 9:
          return this.api.hap.Characteristic.CurrentHeaterCoolerState.COOLING;
          break;
        default:
          this.log.info('Unhandled ac_mode in getCurrentHeatingCoolingState. Returning off as fail safe.');
          return this.api.hap.Characteristic.CurrentHeaterCoolerState.INACTIVE;
          break;
      }
    }
  }

  getTargetHeatingCoolingState(zone: ZoneStatus, AirTouchWrapper: Airtouch5Wrapper) {
    const my_ac_num = AirTouchWrapper.zoneMapping[+zone.zone_number];
    const ac_mode = +AirTouchWrapper.acs[my_ac_num].ac_status!.ac_mode;

    switch(ac_mode) {
      case 0:
        return this.api.hap.Characteristic.TargetHeaterCoolerState.AUTO;
        break;
      case 1:
        return this.api.hap.Characteristic.TargetHeaterCoolerState.HEAT;
        break;
      case 2:
        this.log.info('AC is set to DRY mode.  This is currently unhandled.  Reporting it as cool instead. ');
        return this.api.hap.Characteristic.TargetHeaterCoolerState.COOL;
        break;
      case 3:
        this.log.info('AC is set to FAN mode.  This is currently unhandled.  Reporting it as cool instead. ');
        return this.api.hap.Characteristic.TargetHeaterCoolerState.COOL;
        break;
      case 4:
        return this.api.hap.Characteristic.TargetHeaterCoolerState.COOL;
        break;
      case 8:
        return this.api.hap.Characteristic.TargetHeaterCoolerState.HEAT;
        break;
      case 9:
        return this.api.hap.Characteristic.TargetHeaterCoolerState.COOL;
        break;
      default:
        this.log.info('Unhandled ac_mode in getCurrentHeatingCoolingState. Returning atuo as fail safe.');
        return this.api.hap.Characteristic.TargetHeaterCoolerState.AUTO;
        break;
    }

  }

  // configure cached accessories
  configureAccessory(accessory) {
    this.log.info('Loading accessory from cache:', accessory.displayName);

    // add the restored accessory to the accessories cache so we can track if it has already been registered
    // this.zoneAccessories.push(accessory);

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


