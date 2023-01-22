import Characteristic from 'homebridge';
import CharacteristicValue from 'homebridge';

export class MAGIC {

  static HEADER_BYTES = [0x55, 0x55, 0x55, 0xAA];

  static ADDRESS_STANDARD_BYTES = [0x80, 0xb0];

  static ADDRESS_EXTENDED_BYTES = [0x90, 0xb0];

  static MSGTYPE_STANDARD = 0xc0;

  static MSGTYPE_EXTENDED = 0x1f;

  static SUBTYPE_ZONE_CTRL = 0x20;

  static SUBTYPE_ZONE_STAT = 0x21;

  static SUBTYPE_AC_CTRL = 0x22;

  static SUBTYPE_AC_STAT = 0x23;

  static EXT_SUBTYPE_AC_ABILITY = 0x11;

  static EXT_SUBTYPE_AC_ERROR = 0x10;

  static EXT_SUBTYPE_ZONE_NAME = 0x13;

  static LENGTH_AC_ABILITY = 26;

  static AC_POWER_STATES = {
    KEEP: 0,
    NEXT: 1,
    OFF: 2,
    ON: 3,
  };

  static AC_MODES = {
    AUTO: 0,
    HEAT: 1,
    DRY: 2,
    FAN: 3,
    COOL: 4,
    KEEP: 5,
  };

  static AC_FAN_SPEEDS = {
    AUTO: 0,
    QUIET: 1,
    LOW: 2,
    MEDIUM: 3,
    HIGH: 4,
    POWERFUL: 5,
    TURBO: 6,
    KEEP: 7,
  };

  static AC_TARGET_TYPES = {
    KEEP: 0,
    SET_VALUE: 1,
    DECREMENT: 2,
    INCREMENT: 3,
  };

  static AC_UNIT_DEFAULT = 0;

  static AC_TARGET_KEEP = 63;

  static ZONE_POWER_STATES = {
    KEEP: 0,
    NEXT: 1,
    OFF: 2,
    ON: 3,
    TURBO: 5,
  };

  static ZONE_CONTROL_TYPES = {
    KEEP: 0,
    NEXT: 1,
    DAMPER: 2,
    TEMPERATURE: 3,
  };

  static AC_TARGET_STATES = {
    OFF: 0,
    HEAT: 1,
    COOL: 2,
    AUTO: 3,
  };

  static ZONE_TARGET_TYPES = {
    KEEP: 0,
    DECREMENT: 2,
    INCREMENT: 3,
    DAMPER: 4,
    TEMPERATURE: 5,
  };

  static ZONE_NUMBER_DEFAULT = 0;


  static ATTR_NAME = 'name';
  static ATTR_ZONE_POWER = 'zone_power_state';
  static ATTR_CURRENT_HEATCOOL = 'zone_current_heatcool';
  static ATTR_TARGET_HEATCOOL = 'zone_target_heatcool';
  static ATTR_CURRENT_TEMP = 'zone_current_temp';
  static ATTR_TARGET_TEMP = 'zone_target_temp';
}
