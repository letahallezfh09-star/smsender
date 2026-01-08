# Render Environment Variables - REQUIRED

## Critical: You MUST set these in Render Dashboard

Go to: https://dashboard.render.com/ → Your Service → Environment

### Authentication (REQUIRED)
```
OFFICE_USERNAME=office
OFFICE_PASSWORD=office12345!
ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin12345!
```

### SMSeem API (REQUIRED)
```
SMSEEM_API_KEY=cdd44080306c44e1b30f6917f05293b4877e26a1ca1f6d986472e5def8aa4c82
SMSEEM_SENDER=SMSeem
```

### Optional
```
PORT=3000
ALLOW_ORIGIN=*
PROXY_API_KEY=(leave empty if not used)
```

## How to Fix 401 Unauthorized Error

If you're getting 401 errors, it means:
1. **OFFICE_USERNAME** or **OFFICE_PASSWORD** are not set in Render
2. The credentials don't match what you're entering

### Steps to Fix:
1. Go to Render Dashboard → Your Service → Environment
2. Verify these are set:
   - `OFFICE_USERNAME=office`
   - `OFFICE_PASSWORD=office12345!`
3. Save changes
4. Render will auto-redeploy
5. Try logging in again with:
   - Username: `office`
   - Password: `office12345!`

## Test Credentials

**Office User (for sending SMS):**
- Username: `office`
- Password: `office12345!`

**Admin User (for managing credits):**
- Username: `admin`
- Password: `admin12345!`

## Verify Environment Variables

After setting them, check Render logs to see if there are warnings:
- Look for: `⚠️ Office basic auth not set` - this means variables are missing
- If you see this warning, the variables aren't set correctly
