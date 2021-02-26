import { EventEmitter } from 'events';
import { ModbusTCPClient } from 'jsmodbus';
import { Socket, TcpSocketConnectOpts } from 'net';
import { Logger } from 'homebridge';

type ReadFunc = (start: number, count: number) => Promise<any>;
class SegmentInfo {
  public min = 9999;
  public max = 0;
  public offset = 9999;
  public values: (number|boolean)[] = [];
}

type RegisterType = 'c' | 'd' | 'h' | 'i';

class Command {
  constructor (
  public readonly command: 'r' | 'w',
  public readonly type: RegisterType,
  public readonly index: number,
  public readonly count: number,
  public readonly value: number) {
    this.time = Date.now();
  }

  public readonly time: number;
}

export class Modbus extends EventEmitter {

  private updateInterval: NodeJS.Timeout | undefined;
  private socket: Socket;
  private modbus: ModbusTCPClient;
  private valuesCache: Record<string, undefined| number| boolean> = {};

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
    this.socket.connect(this.ip);
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
    
    this.valuesCache[address] = undefined;
    this.log.debug('some item signed for ' + address);
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
    // set operation should have higher priority than get. That's why insert commands at the beginning of queue
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
      this.updateInterval = undefined;
    }

    if (this.executing) {
      this.executing = undefined; // TODO: Remove this quick fix (break the execution of queue function)
    }

    setTimeout(() => {
      this.log.info('Reconnecting to', this.ip.host);
      this.socket.connect(this.ip);
    }, 1000);
  }

  private update() {
    if (this.commands.length > 100) {
      this.log.warn('Command queue has too much (' + this.commands.length + ') items. Update skipped'); // ???
      // reset command queue
      this.commands = [];
      return;
    }
    
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
  private cycle = 0;
  private fire() {
    if (this.executing) {
      return;
    }

    this.cycle++;
    this.executing = this.queue().then(() => this.executing = undefined);
  } 

  private async queue() {
    // TODO: Make command queue overfill protection smarter
    const cyrcle = this.cycle; // indicator to avoid multiple queue simultaneous execution

    const read = {
      'c': this.modbus.readCoils.bind(this.modbus),
      'd': this.modbus.readDiscreteInputs.bind(this.modbus), 
      'h': this.modbus.readHoldingRegisters.bind(this.modbus),
      'i': this.modbus.readInputRegisters.bind(this.modbus),
    };
    let readf: ReadFunc;
    let sent: number;

    while (this.commands.length > 0 && this.cycle === cyrcle) {
      const command = this.commands.shift();
      
      switch(command?.command) {
        case 'r':
          readf = read[command.type];
          sent = 0;
          
          // TODO: make groping smarter
          // split request into small pieces because modbus has restrictions
          while (sent < command.count) {
            const next = Math.min(command.count - sent, 64);
            const index = command.index + sent;
            await readf(index, next)
              .then((response) => this.updateValues(response, index, next, command));
            sent += next;
          }
          break;
        case 'w':
          this.log.debug('Writing ' + command.value + ' to ' + command.type + command.index);
          await command.type !== 'h' ? 
            this.modbus.writeSingleCoil(command.index, command.value > 0 ? 1 : 0) :
            this.modbus.writeSingleRegister(command.index, command.value);
          break;
      }
    }
  }

  private updateValues(response, index: number, count: number, command:Command) {
    const values: (number|boolean)[] = response.response.body.valuesAsArray;
    if (values.length !== count) {
      this.log.warn('Something went wrong with modbus responce: received count not equal to requested');
    }

    const segment = this.segments[command.type];

    for(let i = 0; i < values.length; i++) {
      const address = command.type + (index + i);
      if (address in this.valuesCache && this.valuesCache[address] !== values[i]) {
        this.log.debug('Value '+ address +
          ' changed from ' + this.valuesCache[address] + 
          ' to ' + values[i]);
        this.emit(address, address, values[i]);
        this.valuesCache[address] = values[i];
      }
    }
    segment.offset = command.index;
    segment.values = values;
  }
}