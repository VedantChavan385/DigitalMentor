Pre login ids of mentor and mentee
- vanya@example.com / password123 (mentor)
- asha@example.com / password123 (mentee)
- admin@example.com / password123 (admin)

## Features

### Video Calling
- **Real-time WebRTC Video Calls**: Mentors and mentees can initiate one-to-one video calls with bidirectional audio and video.
- **Easy Call Initiation**: From the Messages page, click the "Call" button next to any contact to start a video call.
- **Call Controls**: During a call, use the Mute and Camera Off buttons to toggle audio and video.
- **Incoming Call Notifications**: Receive an incoming call modal with the caller's name. Accept or decline calls before joining.
- **Auto-call Links**: Append `?autocall=1` to the chat URL to automatically start a call when the receiver accepts.

### Calling Rules
- **Mentors** can call any **mentee** from their Messages list.
- **Mentees** can call any **mentor** from their Messages list.
- **Admins** can call any user.
- All calls are end-to-end encrypted via WebRTC (peer-to-peer).

### How to Use Video Calling
1. Navigate to **Messages** in the main menu.
2. Select a contact (mentor or mentee) from the conversation list.
3. Click the **"Call"** button to initiate a video call.
4. The recipient will see an incoming call notification with your name.
5. The recipient clicks **Accept** to join the call.
6. Use **Mute** and **Camera Off** buttons to control your media during the call.
7. Click **End Call** to disconnect.