# DigitalMentor

Empowering women to return to their careers through mentorship, real-time chat, and video calling.

## Overview

DigitalMentor is a web platform that connects mentees (returning professionals) with experienced mentors. Features include one-to-one messaging, real-time WebRTC video calling, resource sharing, and session request management.

## Features

- **User Authentication** — Register as mentor or mentee; secure login with bcrypt hashing
- **Real-time Messaging** — One-to-one chat with unread count badges and conversation history
- **Video Calling** — WebRTC peer-to-peer calls with mute/camera controls and incoming call notifications
- **Mentor Browsing** — Search and view mentor profiles by expertise
- **Resources** — Mentors can post articles/guides; mentees can view and learn
- **Session Requests** — Schedule mentorship sessions with date/note tracking
- **Admin Dashboard** — Manage users and platform content
- **Responsive Design** — Bootstrap-based UI for desktop and mobile

## Tech Stack

- **Backend:** Node.js, Express.js, MongoDB (Mongoose ODM)
- **Real-time:** Socket.IO (signaling, chat, notifications)
- **Media:** WebRTC (peer-to-peer video/audio)
- **Frontend:** EJS templates, Bootstrap 5, Vanilla JavaScript
- **Authentication:** express-session, bcrypt
- **File Uploads:** Multer

## Installation

### Prerequisites
- Node.js (v14+)
- MongoDB (local or Atlas connection)
- npm

### Setup Steps

1. **Clone the repository:**
   ```bash
   git clone https://github.com/VedantChavan385/DigitalMentor.git
   cd DigitalMentor
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure environment variables:**
   Create a `.env` file in the project root:
   ```env
   PORT=3000
   MONGO_URI=mongodb://127.0.0.1:27017/digitalmentor_complete
   SESSION_SECRET=your_secret_key_here
   NODE_ENV=development
   ```

4. **Start the application:**
   ```bash
   npm run dev
   ```
   or for production:
   ```bash
   node app.js
   ```

5. **Open in browser:**
   ```
   http://localhost:3000
   ```

## Database Setup

### MongoDB Local Installation
- Download and install MongoDB Community Edition
- Start MongoDB service (default: `mongodb://127.0.0.1:27017`)
- Update `MONGO_URI` in `.env` if using a different connection

### MongoDB Atlas (Cloud)
- Create a free cluster at https://www.mongodb.com/cloud/atlas
- Get connection string and update `MONGO_URI` in `.env`
