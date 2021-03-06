var expect = require('chai').expect,
    launcher = require('./helpers/launcher.js'),
    inherits = require('util').inherits,
    EventEmitter = require('events').EventEmitter,
    InjectorClient = require('../lib/InjectorClient').InjectorClient,
    ConsoleClient = require('../lib/ConsoleClient').ConsoleClient,
    ConsoleAgent = require('../lib/ConsoleAgent').ConsoleAgent;

var consoleAgent,
    consoleClient,
    childProcess,
    debuggerClient;
var frontendClient = new EventEmitter();
frontendClient.sendEvent = function(event, message) {
  this.emit(event, message);
};
frontendClient.sendLogToConsole = function(type, message) {
  throw new Error(message);
};


describe('ConsoleAgent', function() {
  before(initializeConsole);
  
  it('should translate console message to frontend', function(done) {
    frontendClient.once('Console.messageAdded', function(message) {
      done();
    });
    childProcess.stdin.write('log simple text');
  });
  
  it('should update repeat counter on repeated message', function(done) {
    frontendClient.once('Console.messageRepeatCountUpdated', function(message) {
      expect(message.count).to.equal(1);
      done();
    });
    childProcess.stdin.write('log simple text');
  });
  
  it('should translate objects', function(done) {
    frontendClient.once('Console.messageAdded', function(message) {
      expect(message.message.parameters).to.deep.equal([{
        type: 'object',
        subtype: undefined,
        objectId: 'console:1:1',
        className: 'Object',
        description: 'Object'
      }]);
      done();
    });
    childProcess.stdin.write('log object');
  });
  
  it('should clear messages', function(done) {
    frontendClient.on('Console.messagesCleared', function() {
      done();
    });
    consoleAgent.clearMessages();
  });
});
  
describe('ConsoleClient', function() {
  var _message;
  
  before(logObjectInChildProcess);
  
  function logObjectInChildProcess(done) {
    frontendClient.once('Console.messageAdded', function(message) {
      _message = message.message;
      done();
    });
    childProcess.stdin.write('log object');
  }
  
  it('should match only valid consoleId', function() {
    function expectIsConsoleId(id) {
      return expect(consoleClient.isConsoleId(id), id);
    }

    expectIsConsoleId('console:1:1').to.be.true();
    expectIsConsoleId('console:1:1:1').to.be.false();
    expectIsConsoleId('console:1:a').to.be.false();
    expectIsConsoleId('console:1:').to.be.false();
    expectIsConsoleId('console::').to.be.false();
    expectIsConsoleId('consol:1:1').to.be.false();
    expectIsConsoleId('::').to.be.false();
    expectIsConsoleId('1').to.be.false();
  });
  
  it('should provide object data', function(done) {
    consoleClient.lookupConsoleId(
      _message.parameters[0].objectId, 
      function(error, lookupBody, lookupRefs) {
        expect(error).to.equal(null);
        expect(lookupBody).to.deep.equal({
          handle: 6,
          type: 'object',
          className: 'Object',
          constructorFunction: { ref: 7 },
          protoObject: { ref: 8 },
          prototypeObject: { ref: 9 },
          properties: [{ name: 'a', propertyType: 1, ref: 10}],
          text: '#<Object>'
        });
        expect(lookupRefs).to.include.keys(['7', '8', '9', '10']);
        done();
      }
    );
  });

  it('should return error on not existed object', function(done) {
    consoleClient.lookupConsoleId(
      'console:2:0', 
      function(error, lookupBody, lookupRefs) {
        expect(error).to.equal('Object #0# not found');
        done();
      }
    );
  });

  it('should return error on not existed message', function(done) {
    consoleClient.lookupConsoleId(
      'console:3:1', 
      function(error, lookupBody, lookupRefs) {
        expect(error).to.equal('Console message #3# not found');
        done();
      }
    );
  });
});

function initializeConsole(done) {
  launcher.runCommandlet(true, function(child, client) {
    childProcess = child;
    debuggerClient = client;
    var injectorClient = new InjectorClient({}, debuggerClient);
        
    consoleClient = new ConsoleClient({}, debuggerClient, frontendClient);

    consoleAgent = new ConsoleAgent({}, debuggerClient, frontendClient, injectorClient, consoleClient);
    
    injectorClient.once('inject', function(injected) {
      if (injected) debuggerClient.request('continue', null, done);
    });
    injectorClient.once('error', done);
    
    consoleAgent.enable({}, injectorClient.inject.bind(injectorClient));
  });
}
