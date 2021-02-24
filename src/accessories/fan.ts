import { ModbusAccessory, AcessoryFactory, ModbusAccessoryContext } from '../accessory';
import { ModbusAccessoryConfig } from '../config';
import { Service, CharacteristicValue, CharacteristicSetCallback, CharacteristicGetCallback } from 'homebridge';

export const factory:AcessoryFactory = (context:ModbusAccessoryContext) => {
  return new FanModbus(context);
};

interface FanConfig extends ModbusAccessoryConfig {
  On: string;
  Auto: string;
}

export class FanModbus extends ModbusAccessory {
    private device: Service | undefined;

    private registers =
    {
      On: '',
      Auto: '',
    };

    private states = {
      On: false,
      Auto: true,
      Speed: 100,
    };

    public init():void {
      this.setAcessoryInformation('Custom-Modbus-Manufacturer', 
        'Custom-Modbus-Fan', 
        'Modbus-Accessory-Serial');

      const config: FanConfig = this.config as FanConfig;
      this.registers.On = this.address(config.On, '"On" property in "' + this.config.name + '" accessory');
      
      this.device = this.service(this.platform.Service.Fan);
      this.device.setCharacteristic(this.platform.Characteristic.Name, this.config.name);

      this.device.getCharacteristic(this.platform.Characteristic.On)
        .on('get', (callback: CharacteristicGetCallback) => {
          callback(null, this.states.On); 
        })
        .on('set', (value: CharacteristicValue, callback: CharacteristicSetCallback) => {
          this.states.On = value as boolean;
          this.modbus.set(this.registers.On, this.states.On ? 100 : 0);
          callback(null);
        })
        .updateValue(this.states.On);

      this.modbus.on(this.registers.On, (address, value) => {
        this.states.On = value as number > 0;
        this.device?.getCharacteristic(this.platform.Characteristic.On)
          .updateValue(this.states.On);
      });

      this.log.debug('Fan modbus "' + this.config.name + '" accessory initialized.');
    }
}