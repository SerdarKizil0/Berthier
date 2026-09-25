import {sqliteTable,text,integer} from 'drizzle-orm/sqlite-core';
export const notebooks=sqliteTable('notebooks',{owner:text('owner').primaryKey(),revision:integer('revision').notNull().default(0),data:text('data').notNull()});
export const dictations=sqliteTable('dictations',{id:text('id').primaryKey(),owner:text('owner').notNull(),raw:text('raw').notNull(),context:text('context'),createdAt:text('created_at').notNull(),status:text('status').notNull().default('queued'),result:text('result')});
