import { ModbusAccessory, AcessoryFactory, ModbusAccessoryContext } from '../accessory';
import { ModbusAccessoryConfig } from '../config';
import { Service, CharacteristicValue, CharacteristicSetCallback, CharacteristicGetCallback } from 'homebridge';

export const factory:AcessoryFactory = (context:ModbusAccessoryContext) => {
  return new SimpleModbusLight(context);
};

interface SimpleLightConfig extends ModbusAccessoryConfig {
  On: string;
}

export class SimpleModbusLight extends ModbusAccessory {
    private lightbulb: Service | undefined;

    private addressOn = '';

    private states = {
      On: false,
    };

    public init():void {
      this.setAcessoryInformation('Custom-Modbus-Manufacturer', 
        'Custom-Modbus-Device', 
        'Modbus-Accessory-Serial');

      const config: SimpleLightConfig = this.config as SimpleLightConfig;
      this.addressOn = this.address(config.On, '"On" property in "' + this.config.name + '" accessory');
      
      this.lightbulb = this.service(this.platform.Service.Lightbulb);
      this.lightbulb.setCharacteristic(this.platform.Characteristic.Name, this.config.name);

      this.lightbulb.getCharacteristic(this.platform.Characteristic.On)
        .on('set', (value: CharacteristicValue, callback: CharacteristicSetCallback) => {
          this.states.On = value as boolean;
          this.modbus.set(this.addressOn, this.states.On ? 1 : 0);
          callback(null);
        })
        .on('get', (callback: CharacteristicGetCallback) => {
          const isOn = this.states.On;
          callback(null, isOn);
        })
        .updateValue(this.states.On);
      
      this.modbus.on(this.addressOn, (address, value) => {
        this.states.On = value as boolean;
        this.lightbulb?.getCharacteristic(this.platform.Characteristic.On)
          .updateValue(this.states.On);
      });

      this.log.debug('Simple light modbus "' + this.config.name + '" accessory initialized.');
    }
}