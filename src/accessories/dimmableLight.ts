import { ModbusAccessory, AcessoryFactory, ModbusAccessoryContext } from '../accessory';
import { ModbusAccessoryConfig } from '../config';
import { Service, CharacteristicValue, CharacteristicSetCallback, CharacteristicGetCallback } from 'homebridge';

export const factory: AcessoryFactory = (context:ModbusAccessoryContext) => {
  return new DimmableModbusLight(context);
};


interface DimmableLightConfig extends ModbusAccessoryConfig {
  On: string;
}


export class DimmableModbusLight extends ModbusAccessory { 
  private lightbulb: Service | undefined;

  private addressOn = '';

  private states = {
    on: false,
    brightness: 50,
  };

  public init():void {
    this.setAcessoryInformation('Custom-Modbus-Manufacturer', 
      'Custom-Modbus-Device', 
      'Modbus-Accessory-Serial');

    const config: DimmableLightConfig = this.config as DimmableLightConfig;
    this.addressOn = this.address(config.On, '"On" property in "' + this.config.name + '" accessory');
    
    this.lightbulb = this.service(this.platform.Service.Lightbulb);
    this.lightbulb.setCharacteristic(this.platform.Characteristic.Name, this.config.name);

    if (this.accessory.context) {
      this.states.brightness = this.accessory.context.brightness;
    } else {
      this.accessory.context = { 
        brightness: this.states.brightness,
      };
    }

    this.lightbulb.getCharacteristic(this.platform.Characteristic.On)
      .on('set', (value: CharacteristicValue, callback: CharacteristicSetCallback) => {
        this.states.on = value as boolean;
        this.modbus.set(this.addressOn, this.states.on ? 101 : 0);
        callback(null);
      })
      .on('get', (callback: CharacteristicGetCallback) => {
        const isOn = this.states.on;
        callback(null, isOn);
      })
      .updateValue(this.states.on);
    
    this.lightbulb.getCharacteristic(this.platform.Characteristic.Brightness)
      .on('set', (value: CharacteristicValue, callback: CharacteristicSetCallback) => {
        this.states.brightness = value as number;
        this.accessory.context.brigtness = this.states.brightness;
        if (this.states.on) {
          this.modbus.set(this.addressOn, this.states.brightness);
        }
        callback(null);
      })
      .on('get', (callback: CharacteristicGetCallback) => {
        callback(null, this.states.brightness);
      })
      .updateValue(this.states.brightness);
    
    this.modbus.on(this.addressOn, (address, value) => {
      this.states.on = value > 0;
      this.states.brightness = value as number;
      this.lightbulb?.getCharacteristic(this.platform.Characteristic.On)
        .updateValue(this.states.on);
      this.lightbulb?.getCharacteristic(this.platform.Characteristic.Brightness)
        .updateValue(this.states.brightness);
    });

    this.log.debug('Dimmable light modbus "' + this.config.name + '" accessory initialized.');
  }
}