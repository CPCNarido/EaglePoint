🦅 EaglePoint – Golf Course Management System

📅 Duration: October 18 – December 1
🏛️ Developed for: Philippine Army Golf Course
🎯 Purpose: To streamline the daily operations of the golf course through digital reservation, player dispatching, and bay activity monitoring.

📖 Overview

EaglePoint is a Golf Course Management System designed to optimize player flow and staff coordination.
It enables military and civilian players to register or reserve playtime, while allowing cashiers, dispatchers, and admins to manage sessions efficiently.

This system ensures that military members (both registered and walk-ins) bypass cashier processing and go directly to the Dispatcher,
while civilians are processed through the Cashier for timed sessions only.

📱 System Modules
🧑‍✈️ Dispatcher Module

Queues servicemen (Tee Boys/Girls) only.

Assigns players (Members and Civilians) to available bays.

Ends sessions when players are done.

Tracks ongoing sessions and bay statuses.

🏌️ Ball Handler Module

Confirms ball pickup to start player timers.

Starts session timers when the Ball Handler confirms ball pickup.

Syncs bay availability with the Dispatcher.

💵 Cashier Module

Registers civilian players by name, receipt number, and session type (timed only).

Forwards civilian players to the Dispatcher queue after payment verification.

Excludes members and military personnel from cashier processing.

👨‍💼 Admin Module

Manages staff accounts (Dispatcher, Ball Handler, Cashier).

Views and generates player activity reports.

Monitors real-time bay occupancy and system performance.

👥 Player Module

Members and Military Personnel: Skip cashier and go straight to the Dispatcher.

Civilians: Must be verified by Cashier and assigned a timed session.

Receives confirmation and bay assignment once ready.

🛠️ Tech Stack
Layer	Technology
Frontend	React / React Native (Expo)
Backend	Nest.js
Database	MySQL
Version Control	Git + GitHub
⚙️ Installation Guide

Clone the repository

git clone https://github.com/yourusername/EaglePoint.git
cd EaglePoint


Install dependencies

npm install


Configure environment variables



Run the backend (Nest.js)

npm run start:dev


Run the frontend (Expo)

cd Frontend
npm start

To check for Db Contents run this "npx prisma studio"

