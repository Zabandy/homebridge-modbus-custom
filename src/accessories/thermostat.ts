import { ModbusAccessory, AcessoryFactory, ModbusAccessoryContext } from '../accessory';
import { ModbusAccessoryConfig } from '../config';
import { Service, CharacteristicValue, CharacteristicSetCallback, CharacteristicGetCallback, Characteristic } from 'homebridge';

export const factory:AcessoryFactory = (context:ModbusAccessoryContext) => {
  return new ThermostatModbus(context);
};

interface ThermostatConfig extends ModbusAccessoryConfig {
    min: 10;
    max: 36;
    auto: string;
    on: string;
    temp: string;
    target: string;
}

export class ThermostatModbus extends ModbusAccessory {
    private device: Service | undefined;

    private registers = {
      temp: '',
      target: '',
      on: '',
      auto: '',
    };

    private states = {
      targetTemp: 23,
      currentTemp: 0,
      currentState: 0,
      targetState: 0,
    };

    public init():void {
      this.setAcessoryInformation('Custom-Modbus-Manufacturer', 
        'Custom-Modbus-Radiator', 
        'Modbus-Accessory-Serial');

      const config: ThermostatConfig = this.config as ThermostatConfig;
      this.registers.temp = this.address(config.temp, 'temp');
      this.registers.target = this.address(config.target, 'target');
      this.registers.on = this.address(config.on, 'on');
      this.registers.auto = this.address(config.auto, 'auto');
      
      this.device = this.service(this.platform.Service.Thermostat);
      this.device.setCharacteristic(this.platform.Characteristic.Name, this.config.name);

      const DeviceState = this.platform.Characteristic.TargetHeatingCoolingState;
      //#region Current Heating Cooling State
      let characteristic: Characteristic;
      
      characteristic = this.device.getCharacteristic(this.platform.Characteristic.CurrentHeatingCoolingState);
      characteristic.on('get', (callback: CharacteristicGetCallback) => {
        callback(null, this.states.currentState);
      });
      characteristic.props.validValues = [DeviceState.OFF, DeviceState.HEAT];
      characteristic.updateValue(this.states.currentState);

      // track current state
      this.modbus.on(this.registers.on, (address, value) => {
        this.states.currentState = (value as number) > 0 ? DeviceState.HEAT : DeviceState.OFF;
        this.device?.getCharacteristic(this.platform.Characteristic.CurrentHeatingCoolingState)
          .updateValue(this.states.currentState);
      });
      //#endregion

      //#region Target Heating Cooling State
      characteristic = this.device.getCharacteristic(this.platform.Characteristic.TargetHeatingCoolingState);
      characteristic.on('get', (callback: CharacteristicGetCallback) => {
        callback(null, this.states.targetState); 
      });
      characteristic.on('set', (value: CharacteristicValue, callback: CharacteristicSetCallback) => {
        this.states.targetState = value as number;
        this.modbus.set(this.registers.auto, this.states.targetState > 0 ? 1 : 0);
        callback(undefined, this.states.targetState);
      });
      characteristic.props.validValues = [DeviceState.OFF, DeviceState.AUTO];
      characteristic.updateValue(this.states.targetState);

      // track target state
      this.modbus.on(this.registers.auto, (address, value) => {
        this.states.targetState = (value as number) > 0 ? DeviceState.AUTO : DeviceState.OFF;
        this.device?.getCharacteristic(this.platform.Characteristic.TargetHeatingCoolingState)
          .updateValue(this.states.targetState);
      });

      //#endregion

      //#region Current Temperature
      characteristic = this.device.getCharacteristic(this.platform.Characteristic.CurrentTemperature)
        .on('get', (callback: CharacteristicGetCallback) => {
          callback(null, this.states.currentTemp);
        })
        .updateValue(this.states.currentTemp);
        
      characteristic.props.minValue = config.min;
      characteristic.props.maxValue = config.max;
      characteristic.props.minStep = 1;
      
      // track current temperature
      this.modbus.on(this.registers.temp, (address, value) => {
        this.states.currentTemp = value as number;
        this.log.debug('Got ' + value + ' on ' + config.name);
        this.device?.getCharacteristic(this.platform.Characteristic.CurrentTemperature)
          .updateValue(this.states.currentTemp);
      });      
      //#endregion

      //#region Target Temperature
      characteristic = this.device.getCharacteristic(this.platform.Characteristic.TargetTemperature)
        .on('get', (callback: CharacteristicGetCallback) => {
          callback(null, this.states.targetTemp);
        })
        .on('set', (value: CharacteristicValue, callback: CharacteristicSetCallback) => {
          this.states.targetTemp = value as number;
          this.modbus.set(this.registers.target, this.states.targetTemp);
          callback(null);
        })
        .updateValue(this.states.targetTemp);

      // track target temperature
      this.modbus.on(this.registers.target, (address, value) => {
        this.states.targetTemp = value as number;
        this.device?.getCharacteristic(this.platform.Characteristic.TargetTemperature)
          .updateValue(this.states.targetTemp);
      });

      characteristic.props.minValue = config.min;
      characteristic.props.maxValue = config.max;
      characteristic.props.minStep = 1;
      //#endregion
        
      this.device.getCharacteristic(this.platform.Characteristic.TemperatureDisplayUnits)
        .updateValue(this.platform.Characteristic.TemperatureDisplayUnits.CELSIUS);

      this.log.debug('Thermostat modbus "' + this.config.name + '" accessory initialized.');
    }

}