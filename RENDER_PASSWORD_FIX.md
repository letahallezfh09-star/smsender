# Fix: Password Not Working on Render

## Problem
Getting "Unauthorized" error when trying to login to admin panel.

## Cause
Environment variables `ADMIN_USERNAME` and `ADMIN_PASSWORD` are either:
- Not set in Render
- Set with different values
- Have extra spaces/quotes

## Solution

### Step 1: Go to Render Dashboard
1. Open: https://dashboard.render.com/
2. Find your service: `smsender`
3. Click on it

### Step 2: Check Environment Variables
1. Click "Environment" tab
2. Look for:
   - `ADMIN_USERNAME`
   - `ADMIN_PASSWORD`
   - `OFFICE_USERNAME`
   - `OFFICE_PASSWORD`

### Step 3: Set/Update Values
**If missing or incorrect, add/update:**

```
ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin12345!
OFFICE_USERNAME=office
OFFICE_PASSWORD=office12345!
```

**Important:**
- NO quotes around values (not `"admin"` but `admin`)
- NO extra spaces before/after
- Exact match: `admin12345!` (with exclamation mark)

### Step 4: Save and Redeploy
1. Click "Save Changes"
2. Wait 2-3 minutes for redeploy
3. Try logging in again

### Step 5: Test Login
Go to: https://smsender.onrender.com/admin

**Admin Login:**
- Username: `admin`
- Password: `admin12345!`

**Office Login:**
- Username: `office`
- Password: `office12345!`

## Verify Variables Are Set

After redeploy, check Render logs:
- Look for: `⚠️ Admin basic auth not set` - means variables are missing
- If you DON'T see this warning, variables are set correctly

## Alternative: Check What's Currently Set

If you're not sure what password is set, you can:
1. Check Render environment variables
2. Or reset them to the values above
3. Save and redeploy
