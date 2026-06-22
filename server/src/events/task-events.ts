import { Injectable } from '@nestjs/common';
import { EventEmitter } from 'events';
import type { ActionItem } from '../entities/action-item.entity';

export interface TaskNewEvent {
  team_id: number;
  action: ActionItem;
}
export interface TaskUpdateEvent {
  team_id: number;
  action: ActionItem;
}
export interface TaskDeleteEvent {
  team_id: number;
  id: number;
}

@Injectable()
export class TaskEvents extends EventEmitter {
  emitNew(payload: TaskNewEvent) {
    this.emit('task:new', payload);
  }
  onNew(handler: (payload: TaskNewEvent) => void) {
    this.on('task:new', handler);
  }

  emitUpdate(payload: TaskUpdateEvent) {
    this.emit('task:update', payload);
  }
  onUpdate(handler: (payload: TaskUpdateEvent) => void) {
    this.on('task:update', handler);
  }

  emitDelete(payload: TaskDeleteEvent) {
    this.emit('task:delete', payload);
  }
  onDelete(handler: (payload: TaskDeleteEvent) => void) {
    this.on('task:delete', handler);
  }
}
