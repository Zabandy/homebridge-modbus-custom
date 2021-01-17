import { ModbusAccessory, AcessoryFactory, ModbusAccessoryContext } from '../accessory';
import { ModbusAccessoryConfig } from '../config';
import { Service, CharacteristicValue, CharacteristicSetCallback, CharacteristicGetCallback } from 'homebridge';

export const factory:AcessoryFactory = (context:ModbusAccessoryContext) => {
  return new CurtainsAccessory(context);
};

interface CurtainsAccessoryConfig extends ModbusAccessoryConfig {
  address: string;
}

export class CurtainsAccessory extends ModbusAccessory {
    private curtains: Service | undefined;

    private device = {
      address: '',
    };

    private states = {
      on: false,
    };

    public init():void {
      this.setAcessoryInformation('Custom-Modbus-Manufacturer', 
        'Custom-Modbus-Device', 
        'Modbus-Accessory-Serial');

      const config = this.config as CurtainsAccessoryConfig;
      this.device.address = this.address(config.address, '"address" property in "' + this.config.name + '" accessory config');
      
      this.curtains = this.service(this.platform.Service.Lightbulb);
      this.curtains.setCharacteristic(this.platform.Characteristic.Name, this.config.name);

      this.curtains.getCharacteristic(this.platform.Characteristic.On)
        .on('set', (value: CharacteristicValue, callback: CharacteristicSetCallback) => {
          this.states.on = value as boolean;
          this.modbus.set(this.device.address, this.states.on ? 21 : 20); // 22 is stop
          callback(null);
        })
        .on('get', (callback: CharacteristicGetCallback) => {
          callback(null, this.states.on);
        })
        .updateValue(this.states.on);
      
      /*
      this.modbus.on(this.device.address, (address, value) => {
        this.states.On = value as boolean;
        this.lightbulb?.getCharacteristic(this.platform.Characteristic.On)
          .updateValue(this.states.On);
      }); //*/

      this.log.info('Curtains modbus "' + this.config.name + '" accessory initialized.');
    }
}