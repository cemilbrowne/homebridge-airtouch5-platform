import { API, DynamicPlatformPlugin, Logger, PlatformConfig, Service, Characteristic, PlatformAccessory } from 'homebridge';
import { AirtouchAPI } from './api';
import { EventEmitter } from 'events';
import { Airtouch5Wrapper } from './airTouchWrapper';
import { PLATFORM_NAME, PLUGIN_NAME } from './settings';
import { MAGIC } from './magic';



export class AirtouchPlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service = this.api.hap.Service;
  public readonly Characteristic: typeof Characteristic = this.api.hap.Characteristic;
  // public readonly zoneAccessories: string[] = [];
  public emitter: EventEmitter;
  airtouch_devices: Array<Airtouch5Wrapper>;
  accessories: Array<PlatformAccessory>;
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
    this.log.debug('PLAT    | Starting to set up Airtouch5 platform.');
    this.emitter = new EventEmitter();
    this.accessories = new Array<PlatformAccessory>();
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
      this.log.debug('PLAT    | Executed didFinishLaunching callback');
      for(let i = 0;i<this.accessories.length;i++) {
        let should_unregister = false;
        if(this.accessories[i].context === undefined) {
          should_unregister = true;
        } else {
          if(this.accessories[i].context.zone_or_ac === undefined) {
            should_unregister = true;
          }
        }
        if(should_unregister === true) {
          this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [this.accessories[i]]);
          this.log.debug('PLAT    | Unregistering accessory. '+i);
        }
      }
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
    this.emitter.on('attempt_reconnect', (in_AirtouchId) => {
      this.onAttemptReconnect(in_AirtouchId);
    });
  }

  discoverDevices() {

    if (this.config.units?.length) {
      this.log.debug('PLAT    | Defined units in config, not doing automated discovery');
      this.config.units.forEach(ip=>this.addAirtouchDevice(ip, 'console-'+ip, 'airtouchid-'+ip, 'device-'+ip));
      return;
    }
    this.emitter.on('found_devices', (ip: string, consoleId: string, AirtouchId: string, deviceName: string) => {
      this.log.debug('PLAT    | Got an AirTouch5 device from dicovery.  Adding it and finding zones: ',
        ip,
        consoleId,
        AirtouchId,
        deviceName);
      this.addAirtouchDevice(ip, consoleId, AirtouchId, deviceName);
    });

    AirtouchAPI.discoverDevices(this.log, this.emitter);

  }

  addAirtouchDevice(in_ip: string, consoleId: string, in_AirtouchId: string, deviceName: string) {
    const result = this.airtouch_devices.find(({ AirtouchId }) => AirtouchId === in_AirtouchId);
    if(result === undefined) {
      const newAirtouch = new Airtouch5Wrapper(in_ip, consoleId, in_AirtouchId, deviceName, this.log, this.emitter, this);
      this.airtouch_devices.push(newAirtouch);
      this.log.debug('PLAT    | Did not find this ip, so added it: ', in_ip);
    } else {
      this.log.debug('PLAT    | IP Address was already in array: ', in_ip);
    }

  }

  onACStatusNotification(ac_status, in_AirtouchId) {
    const result = this.airtouch_devices.find(({ AirtouchId }) => AirtouchId === in_AirtouchId);
    if(result === undefined) {
      this.log.debug('PLAT    | Error condition in AC Status, no AirTouch ID found', in_AirtouchId);
    } else {
      result.AddUpdateAcStatus(ac_status);
    }
  }

  onZoneStatusNotification(zone_status, in_AirtouchId) {
    const result = this.airtouch_devices.find(({ AirtouchId }) => AirtouchId === in_AirtouchId);
    if(result === undefined) {
      this.log.debug('PLAT    | Error condition in Zone Status, no AirTouch ID found', in_AirtouchId);
    } else {
      result.AddUpdateZoneStatus(zone_status);
    }
  }

  onZoneNameNotification(zone_number, zone_name, in_AirtouchId) {
    const result = this.airtouch_devices.find(({ AirtouchId }) => AirtouchId === in_AirtouchId);
    if(result === undefined) {
      this.log.debug('PLAT    | Error condition in Zone Status, no AirTouch ID found', in_AirtouchId);
    } else {
      result.AddZoneName(zone_number, zone_name);
    }
  }

  onAttemptReconnect(in_AirtouchId) {
    const result = this.airtouch_devices.find(({ AirtouchId }) => AirtouchId === in_AirtouchId);
    if(result === undefined) {
      this.log.debug('PLAT    | Attempt reconnect message, but no AirTouch ID found', in_AirtouchId);
    } else {
      result.AttemptReconnect();
    }
  }

  onACAbilityNotification(ac_ability, in_AirtouchId) {
    const result = this.airtouch_devices.find(({ AirtouchId }) => AirtouchId === in_AirtouchId);
    if(result === undefined) {
      this.log.debug('PLAT    | Error condition in AC Ability, no AirTouch ID found', in_AirtouchId);
    } else {
      result.AddAcAbility(ac_ability);
    }
  }

  // configure cached accessories
  configureAccessory(accessory) {
    this.accessories.push(accessory);
  }

  findAccessory(AirtouchId: string, ac_number: number, zone_or_ac: string, zone_number?: number): PlatformAccessory | undefined {

    for(let i = 0; i<this.accessories.length;i++) {
      const my_context = this.accessories[i].context;
      if(my_context.AirtouchId !== undefined && my_context.AirtouchId === AirtouchId) {

        if(my_context.ac_number !== undefined && +my_context.ac_number === ac_number) {

          if(zone_or_ac === MAGIC.ZONE_OR_AC.AC && my_context.zone_or_ac === MAGIC.ZONE_OR_AC.AC) {

            return this.accessories[i];
          }
          if(zone_or_ac === MAGIC.ZONE_OR_AC.ZONE && my_context.zone_or_ac === MAGIC.ZONE_OR_AC.ZONE) {

            if(my_context.zone_number !== undefined && +my_context.zone_number === zone_number) {

              return this.accessories[i];
            }
          }
        }
      }
    }
    return undefined;
  }
}


