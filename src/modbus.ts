import { EventEmitter } from 'events';
import { ModbusTCPClient } from 'jsmodbus';
import { Socket, TcpSocketConnectOpts } from 'net';
import { Logger } from 'homebridge';
import { exec } from 'child_process';

class SegmentInfo {
  public min = 9999;
  public max = 0;
  public offset = 9999;
  public values = [];
}

type RegisterType = 'c' | 'd' | 'h' | 'i';

class Command {
  constructor (
  public command: 'r' | 'w',
  public type: RegisterType,
  public index: number,
  public count: number,
  public value: number) {}
}

export class Modbus extends EventEmitter {

  private updateInterval: NodeJS.Timeout | undefined;
  private socket: Socket;
  private modbus: ModbusTCPClient;

  private segments: Record<RegisterType, SegmentInfo> = {
    'c': new SegmentInfo,
    'd': new SegmentInfo,
    'h': new SegmentInfo,
    'i': new SegmentInfo,
  };

  constructor (private readonly ip: TcpSocketConnectOpts, 
               private readonly log: Logger,
               private readonly unit: number,
               private readonly poll: number) {
    super();
    this.ip = ip;

    this.socket = new Socket();
    this.modbus = new ModbusTCPClient(this.socket, unit);
    
    this.socket.on('connect', this.socketConnected.bind(this));
    this.socket.on('error', this.socketError.bind(this));
    this.socket.on('close', this.socketClosed.bind(this));
  }

  public connect() {
    this.socket.connect(this.ip);this.modbus.readInputRegisters;
  }

  public on(address: string, listener: (address: string, value: number | boolean) => void): this {
    if (address === '') {
      return this;
    }

    const type = address[0] as RegisterType;
    const index = parseInt(address.substr(1));
    
    const seg = this.segments[type];
    seg.min = Math.min(seg.min, index);
    seg.max = Math.max(seg.max, index);

    super.on(address, listener);
    return this;
  }

  public set(address: string, value: number | boolean): this {
    if (address === '') {
      return this;
    }

    const type = address[0];
    const index = parseInt(address.substr(1));
    let final: number;
    if (typeof value === 'boolean') {
      final = value ? 1 : 0;
    } else {
      final = value; 
    }
    // set should have higher priority than read. That is why insert commands at the beginning of order
    this.commands.unshift(new Command('w', type as RegisterType, index, 0, final));
    this.fire();

    return this;
  }

  private socketConnected() {
    this.log.info('Socket connected');

    this.update();
      
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }
    this.updateInterval = setInterval(this.update.bind(this), this.poll);
  }

  private socketError(error:Error) {
    this.log.error(error.message);
  }

  private socketClosed(error) {
    this.log.error('Socket closed. ' + error);
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }

    setTimeout(() => {
      this.log.info('Reconnecting to', this.ip.host);
      this.socket.connect(this.ip);
    }, 1000);
  }

  private update() {
    for(const type in this.segments) {
      const seg = this.segments[type];
      if (seg.max < seg.min) {
        continue; 
      }
      
      this.commands.push(new Command('r', type as RegisterType, seg.min, seg.max-seg.min + 1, 0));
      this.fire();
    }
  }
  
  private commands: Command[] = [];
  private executing: Promise<undefined> | undefined;
  private fire() {
    if (this.executing) {
      return;
    }

    this.executing = this.queue().then(() => this.executing = undefined);
  } 

  private async queue() {
    // TODO: Make command queue overfill protection

    while (this.commands.length > 0) {
      const command = this.commands.shift();
      switch(command?.command) {
        case 'r':
          this.log.debug('reading ' + command.type + '(' + command.index + ', ' + command.count + ')');

          switch(command.type){
            case 'c': await this.modbus.readCoils(command.index, command.count)
              .then((response) => this.updateValues(response, command)); 
              break;
            case 'd': await this.modbus.readDiscreteInputs(command.index, command.count)
              .then((response) => this.updateValues(response, command)); 
              break;
            case 'h': await this.modbus.readHoldingRegisters(command.index, command.count)
              .then((response) => this.updateValues(response, command)); 
              break;
            case 'i': await this.modbus.readInputRegisters(command.index, command.count)
              .then((response) => this.updateValues(response, command)); 
              break;
          }

          break;
        case 'w':
          this.log.debug('writing ' + command.value + ' to ' + command.type + command.index);
          await command.type !== 'h' ? 
            this.modbus.writeSingleCoil(command.index, command.value > 0 ? 1 : 0) :
            this.modbus.writeSingleRegister(command.index, command.value);
          break;
      }
    }
  }

  private updateValues(response, command:Command) {
    const values: (number|boolean)[] = response.response.body.valuesAsArray;
    for(let i = 0; i < values.length; i++) {
      // TODO: check if value has been changed
      const address = command.type + (command.index + i);
      this.emit(address, address, values[i]);
    }
  }
}