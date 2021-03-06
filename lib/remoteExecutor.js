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

var portscanner = require('portscanner');
var sshCheck = require('nscale-util').sshcheck();
var POLL_INTERVAL = 5000;
var MAX_POLLS = 14;



module.exports = function(config, commands, logger) {
  var ssh = require('nscale-util').sshexec();
  var scp = require('nscale-util').sshcp();
  var pollCount = 0;



  var pollForConnectivity = function(mode, ipaddress, out, cb) {
    if (mode !== 'preview' && ipaddress && ipaddress !== '127.0.0.1' && ipaddress !== 'localhost') {
      logger.info('waiting for connectivity: ' + ipaddress);
      portscanner.checkPortStatus(22, ipaddress, function(err, status) {
        if (status === 'closed') {
          if (pollCount > MAX_POLLS) {
            pollCount = 0;
            cb('timeout exceeded - unable to connect to: ' + ipaddress);
          }
          else {
            pollCount = pollCount + 1;
            setTimeout(function() { pollForConnectivity(mode, ipaddress, out, cb); }, POLL_INTERVAL);
          }
        }
        else if (status === 'open') {
          pollCount = 0;
          sshCheck.check(ipaddress, commands.defaultUser, config.sshKeyPath, out, function(err) {
            cb(err);
          });
        }
      });
    }
    else {
      cb();
    }
  };



  var nameFromBin = function(container) {
    var name = null;

    if (container.specific && container.specific.containerBinary) {
      var bin = container.specific.containerBinary.split('/');
      name = bin[bin.length - 1];
    }
    return name;
  };



  var deploy = function(mode, targetHost, system, containerDef, container, out, cb) {
    pollForConnectivity(mode, targetHost.privateIpAddress, out, function(err) {
      if (err) { return cb(err); }
      ssh.exec(mode, targetHost.privateIpAddress, commands.defaultUser, config.sshKeyPath, 'mkdir -p /home/ubuntu/containers', function(err, op) {
        out.preview(op);
        if (err) { return cb(err); }
        var name = nameFromBin(container);

        ssh.exec(mode, targetHost.privateIpAddress, commands.defaultUser, config.sshKeyPath, '[ ! -f /home/ubuntu/containers/' + name + ' ] && echo "notfound"', function(err, op, response) {
          out.preview(op);
          if (err) { return cb(err); }
          if (response && 'notfound' === response.trim()) {
            scp.copy(mode, targetHost.privateIpAddress, commands.defaultUser, config.sshKeyPath, container.specific.containerBinary, '/home/ubuntu/containers/' + name, out, function(err, op) {
              out.preview(op);
              if (err) { return cb(err); }
              var importCommand = commands.import.replace('__BINARY__', '/home/ubuntu/containers/' + name);
              importCommand = importCommand.replace('__TARGETNAME__', name);
              ssh.exec(mode, targetHost.privateIpAddress, commands.defaultUser, config.sshKeyPath, importCommand, function(err, op) {
                out.preview(op);
                cb(err);
                //setTimeout(function() { cb(err); }, 10000);
              });
            });
          }
          else {
            ssh.exec(mode, targetHost.privateIpAddress, commands.defaultUser, config.sshKeyPath, 'sudo docker images', function(err, op, images) {
              out.preview(op);
              if (err) { return cb(err); }
              var re = new RegExp(name, ['g']);
              if (!re.test(images)) {
                var importCommand = commands.import.replace('__BINARY__', '/home/ubuntu/containers/' + name);
                importCommand = importCommand.replace('__TARGETNAME__', name);
                ssh.exec(mode, targetHost.privateIpAddress, commands.defaultUser, config.sshKeyPath, importCommand, function(err, op) {
                  out.preview(op);
                  cb(err);
                  //setTimeout(function() { cb(err); }, 10000);
                });
              }
              else {
                cb(err);
              }
            });
          }
        });
      });
    });
  };



  var start = function(mode, targetHost, system, containerDef, container, out, cb) {
    var name = nameFromBin(container);
    var startCmd;
    name = system.namespace + '/' + name;

    if (containerDef.specific.arguments) {
      startCmd = commands.run.replace('__ARGUMENTS__', containerDef.specific.arguments);
      startCmd = startCmd.replace(/__TARGETNAME__/g, name);
    }
    if (containerDef.specific.execute) {
      if (containerDef.specific.execute.name) {
        name = containerDef.specific.execute.name;
      }
      startCmd = commands.execute + ' ' +
                 containerDef.specific.execute.args + ' ' + 
                 name + ' ' +
                 containerDef.specific.execute.exec;
    }
    pollForConnectivity(mode, targetHost.privateIpAddress, out, function(err) {
      if (err) { return cb(err); }
      ssh.exec(mode, targetHost.privateIpAddress, commands.defaultUser, config.sshKeyPath, startCmd, function(err, op) {
        out.preview(op);
        cb(err);
      });
    });
  };



  var link = function(mode, targetHost, system, containerDef, container, out, cb) {
    cb();
  };



  var unlink = function(mode, targetHost, system, containerDef, container, out, cb) {
    cb();
  };



  var stop = function(mode, targetHost, system, containerDef, container, out, cb) {
    if (container.specific && container.specific.dockerContainerId) {
      var stopCmd = commands.kill.replace('__TARGETID__', container.specific.dockerContainerId);

      pollForConnectivity(mode, targetHost.privateIpAddress, out, function(err) {
        if (err) { return cb(err); }
        ssh.exec(mode, targetHost.privateIpAddress, commands.defaultUser, config.sshKeyPath, stopCmd, function(err, op) {
          out.preview(op);
          cb(err);
        });
      });
    }
    else {
      cb();
    }
  };



  var undeploy = function(mode, targetHost, system, containerDef, container, out, cb) {
    pollForConnectivity(mode, targetHost.privateIpAddress, out, function(err) {
      if (err) { return cb(err); }
      ssh.exec(mode, targetHost.privateIpAddress, commands.defaultUser, config.sshKeyPath, commands.deleteUntaggedContainers, function(err, op) {
        out.preview(op);
        ssh.exec(mode, targetHost.privateIpAddress, commands.defaultUser, config.sshKeyPath, commands.deleteUntaggedImages, function(err, op) {
          out.preview(op);
          cb();
        });
      });
    });
  };



  return {
    deploy: deploy,
    undeploy: undeploy,
    start: start,
    link: link,
    unlink: unlink,
    stop: stop,
  };
};

