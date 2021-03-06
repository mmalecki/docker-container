/*
 * THIS SOFTWARE IS PROVIDED ``AS IS'' AND ANY EXPRESSED OR IMPLIED
 * WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES
 * OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED.  IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY DIRECT,
 * INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
 * (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
 * SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION)
 * HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT,
 * STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING
 * IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
 * POSSIBILITY OF SUCH DAMAGE.
 */

'use strict';

var os = require('os');
var platform = require('./platform');
var portscanner = require('portscanner');
var bunyan = require('bunyan');

var POLL_INTERVAL = 5000;
var MAX_POLLS = 14;


module.exports = function(config, logger) {

  var builder = require('./dockerBuilder')(config, os.platform());
  var _pollCount = 0;

  logger = logger || bunyan.createLogger({name: 'docker-container'});



  /**
   * there is a time delay between AWS instance start and connectivity being established,
   * we therefore poll for connectivity before attempting a deploy
   */
  var pollForConnectivity = function(mode, ipaddress, cb) {
    if (mode !== 'preview') {
      logger.info('waiting for connectivity: ' + ipaddress);
      portscanner.checkPortStatus(22, ipaddress, function(err, status) {
        if (status === 'closed') {
          if (_pollCount > MAX_POLLS) {
            _pollCount = 0;
            cb('timeout exceeded - unable to connect to: ' + ipaddress);
          }
          else {
            _pollCount = _pollCount + 1;
            setTimeout(function() { pollForConnectivity(mode, ipaddress, cb); }, POLL_INTERVAL);
          }
        }
        else if (status === 'open') {
          _pollCount = 0;
          cb(err);
        }
      });
    }
    else {
      cb();
    }
  };


  /**
   * build the container 
   * system - the system definition
   * cdef - contianer definition block
   * out - ouput stream 
   * cb - complete callback
   */
  var build = function build(mode, system, cdef, out, cb) {
    logger.info('building');
    out.stdout('building');
    builder.build(mode, system, cdef, out, function(err, specific) {
      if (err) { logger.error(err); return cb(err); }
      cdef.specific.binary = specific.containerBinary;
      cdef.specific.dockerImageId = specific.dockerImageId;
      cb(err, specific);
    });
  };



  /**
   * deploy the continaer
   * target - target to deploy to
   * system - the target system defintinion
   * cdef - the contianer definition
   * container - the container as defined in the system topology
   * out - ouput stream 
   * cb - complete callback
   */
  var deploy = function deploy(mode, target, system, containerDef, container, out, cb) {
    var executor = platform.executor(config, target.privateIpAddress, os.platform(), logger);
    logger.info('deploying');
    out.stdout('deploying');
    executor.deploy(mode, target, system, containerDef, container, out, function(err) {
      cb(err);
    });
  };



  /**
   * undeploy the container from the target
   * target - target to deploy to
   * system - the target system defintinion
   * cdef - the contianer definition
   * container - the container as defined in the system topology
   * out - ouput stream 
   * cb - complete callback
   */
  var undeploy = function undeploy(mode, target, system, containerDef, container, out, cb) {
    var executor = platform.executor(config, target.privateIpAddress, os.platform(), logger);
    logger.info('undeploying');
    out.stdout('undeploying');
    executor.undeploy(mode, target, system, containerDef, container, out, function(err) {
      cb(err);
    });
  };



  /**
   * start the container on the target
   * target - target to deploy to
   * system - the target system defintinion
   * cdef - the contianer definition
   * container - the container as defined in the system topology
   * out - ouput stream 
   * cb - complete callback
   */
  var start = function start(mode, target, system, containerDef, container, out, cb) {
    var executor = platform.executor(config, target.privateIpAddress, os.platform(), logger);
    logger.info('starting');
    out.stdout('starting');
    executor.start(mode, target, system, containerDef, container, out, function(err) {
      cb(err);
    });
  };



  /**
   * stop the container on the target
   * target - target to deploy to
   * system - the target system defintinion
   * cdef - the contianer definition
   * container - the container as defined in the system topology
   * out - ouput stream 
   * cb - complete callback
   */
  var stop = function stop(mode, target, system, containerDef, container, out, cb) {
    var executor = platform.executor(config, target.privateIpAddress, os.platform(), logger);
    logger.info('stopping');
    out.stdout('stopping');
    executor.stop(mode, target, system, containerDef, container, out, function(err) {
      cb(err);
    });
  };



  /**
   * link the container to the target
   * target - target to deploy to
   * system - the target system defintinion
   * cdef - the contianer definition
   * container - the container as defined in the system topology
   * out - ouput stream 
   * cb - complete callback
   */
  var link = function link(mode, target, system, containerDef, container, out, cb) {
    var executor = platform.executor(config, target.privateIpAddress, os.platform(), logger);
    logger.info('linking');
    out.stdout('linking');
    executor.link(mode, target, system, containerDef, container, out, function(err) {
      cb(err);
    });
  };



  /**
   * unlink the container from the target
   * target - target to deploy to
   * system - the target system defintinion
   * cdef - the contianer definition
   * container - the container as defined in the system topology
   * out - ouput stream 
   * cb - complete callback
   */
  var unlink = function unlink(mode, target, system, containerDef, container, out, cb) {
    var executor = platform.executor(config, target.privateIpAddress, os.platform(), logger);
    logger.info('unlinking');
    out.stdout('unlinking');
    executor.unlink(mode, target, system, containerDef, container, out, function(err) {
      cb(err);
    });
  };



  return {
    build: build,
    deploy: deploy,
    start: start,
    stop: stop,
    link: link,
    unlink: unlink,
    undeploy: undeploy,
    add: deploy,
    remove: undeploy
  };
};

