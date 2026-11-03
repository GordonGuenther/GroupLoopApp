# GroupLoop

> A self-hosted, open-source group coordination platform

GroupLoop helps small groups (families, friends, working groups, training budies, etc.) coordinate their activities through shared calendars, lists, and chat - all in one simple interface.
You can also self-host the backend to have fully control of your data. It's really easy to set up.

## Features
### MVP (Epic 1-4)
- 🔐 **Secure Authentication** - Email/password verification flow
- 👥 **Group Management** - Create groups, invite members, manage access
- 📅 **Shared Calendar** - Create, edit, delete events with recurring support and reminders
- ✅ **Shared Lists** - Coordinate tasks with assignees and completion tracking
- 💬 **Group Chat** - Send messages, edit/delete own messages with search
- 🔄 **Real-time Updates** - WebSocket-based synchronization for all changes
- 📱 **Push Notifications** - Stay notified about messages and calendar changes
- 🏠 **Self-Hosting** - Designed for easy self-hostable deployment

## Tech Stack
**Frontend:**
- React Native (Expo)
- TypeScript (strict mode)
- React Navigation (tabs + stacks)
- RxDB for offline-first and syncing with SupaBase

**Backend:**
- SupaBase (self-hostable Postgres based backend)

**Infrastructure:**
- allows your own SupaBase backend weather it's hosted in the cloud or self-hosted

## Self-Hosting the Backend
```bash
sh backend/setup.sh
```
Choose the `minimal` variant to self-host, or `dev` for development. See [Backend setup](docs/backend-setup.md) for requirements, options and running the stack.

## Project Structure
```
GroupLoopApp/
├── frontend/           # React Native Expo app
├── backend/            # SupaBase backend
├── docs/               # Documentation
└── README.md           # This file
```
