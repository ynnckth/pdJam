import express from 'express';
import * as http from 'http';
import {Socket} from 'socket.io';
import * as path from 'path';
import * as net from 'net';
import PdClient from './PdClient';
import {SynthSettings} from 'SynthSettings.ts';


const app = express();

app.set('port', process.env.PORT || 5000);

app.use(express.static(path.join(__dirname, '../client')));
app.all('*', (req, res) => {
  res.redirect('/');
});

export const server = http.createServer(app);
const io = require('socket.io')(server);

const pdClient = new PdClient(new net.Socket(), process.env.PD_HOST || '127.0.0.1', +process.env.PD_PORT || 5001);
pdClient.connect();

// Client socket id => Pd id
const userPdMappings: Map<string, number> = new Map();
const availablePdUsers: number[] = [];

for (let currentUser = 0; currentUser < PdClient.MAX_USERS; currentUser++) {
  availablePdUsers.push(currentUser);
}

const broadcastNumberOfConnectedClients = () => {
  io.emit('connected_clients', PdClient.MAX_USERS - availablePdUsers.length);
  console.log('No. of connected clients: ', PdClient.MAX_USERS - availablePdUsers.length);
  console.log(userPdMappings);
};

io.on('connection', (socket: Socket) => {
  console.log('Client connected. Socket id: ', socket.id);

  if (availablePdUsers.length <= 0) {
    console.log('No more clients available');
    return;
  }

  const pdUserId = availablePdUsers.pop();
  userPdMappings.set(socket.id, pdUserId);

  broadcastNumberOfConnectedClients();

  socket.on('disconnect', () => {
    const pdUser = userPdMappings.get(socket.id);
    if (!pdUser) {
      console.log('Could not find pd user for client id: ', socket.id);
      return;
    }
    pdClient.exitUser(pdUser);
    availablePdUsers.push(pdUserId);
    userPdMappings.delete(socket.id);
    broadcastNumberOfConnectedClients();
    console.log('Client disconnected. Socket id: ', socket.id);
  });

  socket.on('init', (settings: SynthSettings) => {
    const pdUser = userPdMappings.get(socket.id);
    if (!pdUser) {
      console.log('Could not find pd user for client id: ', socket.id);
      return;
    }
    pdClient.updateSynthSettings(pdUser, settings);
    pdClient.enterUser(pdUser);
    console.log('Initialized pdUser ', pdUser);
  });

  socket.on('value_change', (settings: SynthSettings) => {
    const pdUser = userPdMappings.get(socket.id);
    if (!pdUser) {
      console.log('Could not find pd user for client id: ', socket.id);
      return;
    }
    pdClient.updateSynthSettings(pdUser, settings);
  });
});

export default app;
