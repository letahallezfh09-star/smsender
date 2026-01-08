# Render Deployment Guide

## How to Update Your Render Deployment

Your app is deployed at: https://smsender.onrender.com/

### Step 1: Push Changes to GitHub

```bash
git push origin main
```

Render will automatically detect the push and redeploy your app.

### Step 2: Update Environment Variables in Render

After pushing, you **MUST** update the environment variables in Render dashboard:

1. Go to: https://dashboard.render.com/
2. Find your service: `smsender`
3. Click on it → Go to "Environment" tab
4. Update/Add these variables:

**Remove these (old SMSPM variables):**
- `SMSPM_TOKEN`
- `SMSPM_HASH`
- `SMSPM_SENDER`

**Add/Update these (new SMSeem variables):**
- `SMSEEM_API_KEY` = `cdd44080306c44e1b30f6917f05293b4877e26a1ca1f6d986472e5def8aa4c82`
- `SMSEEM_SENDER` = `SMSeem` (optional, defaults to "SMSeem")

**Keep these (unchanged):**
- `ADMIN_USERNAME` = `admin`
- `ADMIN_PASSWORD` = (your admin password)
- `OFFICE_USERNAME` = `office`
- `OFFICE_PASSWORD` = (your office password)
- `PORT` = `3000` (or leave default)
- `ALLOW_ORIGIN` = `*` (or your domain)
- `PROXY_API_KEY` = (if you use it)

### Step 3: Redeploy (if needed)

After updating environment variables, Render should automatically redeploy. If not:
1. Go to your service in Render dashboard
2. Click "Manual Deploy" → "Deploy latest commit"

### Step 4: Verify Deployment

1. Check health: https://smsender.onrender.com/health
2. Test login: https://smsender.onrender.com/
3. Try sending an SMS

## Important Notes

- **Never commit `.env` file** - it's in `.gitignore`
- Environment variables are set in Render dashboard, not in code
- Render auto-deploys on git push to main branch
- Check Render logs if deployment fails

## Troubleshooting

If deployment fails:
1. Check Render logs: Dashboard → Your Service → Logs
2. Verify all environment variables are set correctly
3. Make sure `SMSEEM_API_KEY` is set
4. Check that Node.js version is compatible (Render uses latest LTS)
