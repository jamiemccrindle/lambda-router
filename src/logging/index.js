import util from 'util'

class Logger {

  constructor(logger, context) {
    this.logger = logger;
    this.context = context;
  }

  _log(level, message) {
    let date = new Date().toISOString()
    let loggedMessage = typeof(message) === 'object' ? util.inspect(message) : message;
    this.logger.log(`${date} ${level} ${this.context.join(' ')} ${loggedMessage}`);
  }

  withContext(value) {
    return new Logger(this.logger, [value].concat(this.context))
  }

  debug(message) {
    this._log('DEBUG', message)
  }

  log(message) {
    this._log('INFO', message)
  }

  info(message) {
    this._log('INFO', message)
  }

  warn(message) {
    this._log('WARN', message)
  }

  error(message) {
    this._log('ERROR', message)
  }

}

export function newLogger(logger) {
  return new Logger(logger, [])
}