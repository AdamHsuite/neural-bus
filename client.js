#!/usr/bin/env node
/**
 * Neural Bus Client
 * 
 * Connect to your neural bus, register instances, broadcast events.
 * 
 * Usage:
 *   const { connect, register, broadcast, urgent } = require('neural-bus/client');
 *   
 *   const bus = await connect();
 *   await register('my-instance', 'Context description');
 *   await broadcast('I learned something new');
 *   
 * @author Adam <adam@hsuite.ai>
 */

const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

const DEFAULT_PORT = 19999;
const DEFAULT_HOST = 'localhost';

class NeuralBusClient {
  constructor(options = {}) {
    this.host = options.host || DEFAULT_HOST;
    this.port = options.port || process.env.NEURAL_BUS_PORT || DEFAULT_PORT;
    this.instanceId = options.instanceId || 'anonymous';
    this.context = options.context || 'unknown';
    this.ws = null;
    this.connected = false;
    this.messageHandlers = [];
  }
  
  async connect() {
    return new Promise((resolve, reject) => {
      const url = `ws://${this.host}:${this.port}`;
      this.ws = new WebSocket(url);
      
      this.ws.on('open', () => {
        this.connected = true;
        resolve(this);
      });
      
      this.ws.on('message', (data) => {
        try {
          const msg = JSON.parse(data);
          this.messageHandlers.forEach(handler => handler(msg));
        } catch (e) {}
      });
      
      this.ws.on('error', (err) => {
        reject(err);
      });
      
      this.ws.on('close', () => {
        this.connected = false;
      });
      
      // Timeout after 5 seconds
      setTimeout(() => {
        if (!this.connected) {
          reject(new Error('Connection timeout'));
        }
      }, 5000);
    });
  }
  
  onMessage(handler) {
    this.messageHandlers.push(handler);
  }
  
  async register(instanceId, context) {
    this.instanceId = instanceId || this.instanceId;
    this.context = context || this.context;
    
    return this.send({
      type: 'register',
      instanceId: this.instanceId,
      context: this.context
    });
  }
  
  async broadcast(message, eventType = 'awareness') {
    return this.send({
      type: 'event',
      eventType,
      message
    });
  }
  
  async urgent(message) {
    return this.send({
      type: 'urgent',
      message
    });
  }
  
  async updateAwareness(updates) {
    return this.send({
      type: 'update_awareness',
      ...updates
    });
  }
  
  async getState() {
    return new Promise((resolve) => {
      const handler = (msg) => {
        if (msg.type === 'state_sync') {
          this.messageHandlers = this.messageHandlers.filter(h => h !== handler);
          resolve(msg.state);
        }
      };
      this.onMessage(handler);
      this.send({ type: 'get_state' });
    });
  }
  
  send(data) {
    if (!this.connected || !this.ws) {
      throw new Error('Not connected to Neural Bus');
    }
    this.ws.send(JSON.stringify(data));
    return true;
  }
  
  close() {
    if (this.ws) {
      this.ws.close();
    }
  }
}

// Quick helper functions for one-off operations
async function quickConnect(port) {
  const client = new NeuralBusClient({ port });
  await client.connect();
  return client;
}

async function quickRegister(instanceId, context, port) {
  const client = await quickConnect(port);
  await client.register(instanceId, context);
  const state = await client.getState();
  client.close();
  return state;
}

async function quickBroadcast(instanceId, context, message, port) {
  const client = await quickConnect(port);
  await client.register(instanceId, context);
  await client.broadcast(message);
  await new Promise(r => setTimeout(r, 100)); // Brief wait for broadcast
  client.close();
  return true;
}

module.exports = {
  NeuralBusClient,
  connect: quickConnect,
  register: quickRegister,
  broadcast: quickBroadcast
};
