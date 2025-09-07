#!/bin/bash

# SMS Sender Deployment Script

echo "🚀 SMS Sender Deployment Script"
echo "================================"

# Check if git is initialized
if [ ! -d ".git" ]; then
    echo "📁 Initializing Git repository..."
    git init
    git add .
    git commit -m "Initial commit: SMS Sender app"
    echo "✅ Git repository initialized"
else
    echo "📁 Git repository already exists"
fi

echo ""
echo "🌐 Deployment Options:"
echo "1. Netlify (Recommended)"
echo "2. Vercel"
echo "3. GitHub Pages"
echo "4. Manual upload"
echo ""

read -p "Choose deployment option (1-4): " choice

case $choice in
    1)
        echo "📤 Deploying to Netlify..."
        echo "1. Go to https://netlify.com"
        echo "2. Sign up/login with GitHub"
        echo "3. Click 'New site from Git'"
        echo "4. Connect your GitHub repository"
        echo "5. Deploy!"
        echo ""
        echo "📋 Files to upload:"
        echo "- index-live.html (rename to index.html)"
        echo "- README.md"
        ;;
    2)
        echo "📤 Deploying to Vercel..."
        echo "1. Install Vercel CLI: npm i -g vercel"
        echo "2. Run: vercel"
        echo "3. Follow the prompts"
        ;;
    3)
        echo "📤 Deploying to GitHub Pages..."
        echo "1. Push to GitHub:"
        echo "   git remote add origin https://github.com/yourusername/smsender.git"
        echo "   git push -u origin main"
        echo "2. Enable GitHub Pages in repository settings"
        ;;
    4)
        echo "📤 Manual Upload Instructions:"
        echo "1. Upload index-live.html to your web server"
        echo "2. Rename it to index.html"
        echo "3. Ensure HTTPS is enabled"
        ;;
    *)
        echo "❌ Invalid option"
        exit 1
        ;;
esac

echo ""
echo "✅ Deployment instructions provided!"
echo "🔑 Don't forget to update the API key in the HTML file"
echo "🔒 Consider using a server-side proxy for production"
