# SMS Sender Web App

A simple web application for sending SMS messages via the Mobivate API.

## Features

- 🔐 Password-protected access
- 📱 Israeli phone number validation
- ✉️ SMS message sending with character count
- 🎨 Dark theme with modern UI
- 📊 Real-time API response display

## Deployment Options

### Option 1: Netlify (Recommended)

1. **Create a GitHub repository**:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin https://github.com/yourusername/smsender.git
   git push -u origin main
   ```

2. **Deploy to Netlify**:
   - Go to [netlify.com](https://netlify.com)
   - Sign up/login with GitHub
   - Click "New site from Git"
   - Connect your GitHub repository
   - Deploy!

### Option 2: Vercel

1. **Install Vercel CLI**:
   ```bash
   npm i -g vercel
   ```

2. **Deploy**:
   ```bash
   vercel
   ```

### Option 3: GitHub Pages

1. **Push to GitHub** (same as Netlify step 1)
2. **Enable GitHub Pages**:
   - Go to repository Settings
   - Scroll to "Pages" section
   - Select "Deploy from a branch"
   - Choose "main" branch
   - Save

## API Configuration

The app uses the Mobivate API:
- **Endpoint**: `https://api.mobivatebulksms.com/send/single`
- **Method**: POST
- **Headers**: 
  - `Content-Type: application/json`
  - `Authorization: Bearer [YOUR_API_KEY]`

## Security Note

⚠️ **Important**: This app exposes the API key in the client-side code. For production use, implement a server-side proxy to protect your API key.

## Files

- `index.html` - Main application (with local proxy)
- `index-live.html` - Live deployment version (direct API calls)
- `proxy.py` - Python proxy server for local development
- `README.md` - This file

## Usage

1. Open the deployed URL
2. Enter password: `change-me`
3. Enter Israeli phone number (format: 972XXXXXXXXX)
4. Enter message (max 612 characters)
5. Click "Send SMS"

## Troubleshooting

- **CORS Errors**: Use the live deployment version
- **401 Unauthorized**: Check your Mobivate API key
- **Network Errors**: Verify internet connection and API endpoint
