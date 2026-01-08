# Troubleshooting Guide

## 403 Authentication Failed Error

If you see "Authentication failed. Please log in again. (Status: 403)", this means:

### Problem
The credentials on Render don't match what you're entering, OR the environment variables aren't set correctly.

### Solution

1. **Check Render Environment Variables:**
   - Go to: https://dashboard.render.com/ → Your Service → Environment
   - Verify these are set (NO quotes, NO extra spaces):
     ```
     OFFICE_USERNAME=office
     OFFICE_PASSWORD=office12345!
     ADMIN_USERNAME=admin
     ADMIN_PASSWORD=admin12345!
     ```

2. **Save and Wait for Redeploy:**
   - Click "Save Changes"
   - Wait 2-5 minutes for Render to redeploy
   - Check logs to confirm deployment completed

3. **Log In with Correct Credentials:**
   - Go to: https://smsender.onrender.com/
   - Username: `office`
   - Password: `office12345!`

4. **If Still Failing:**
   - Check Render logs for warnings like: `⚠️ Office basic auth not set`
   - This means the environment variables aren't being read correctly
   - Make sure there are NO quotes around the values
   - Make sure there are NO spaces before/after the `=` sign

## Blocked Sender Names

If you try to send with a blocked sender name (like "isracard"), you'll get an error:
- **Error:** `Sender name "isracard" is blocked. Please use a different sender name.`

### To Unblock a Sender:
1. Log in to Admin panel: https://smsender.onrender.com/admin
2. Use admin credentials:
   - Username: `admin`
   - Password: `admin12345!`
3. Go to "Blocked Sender IDs" section
4. Click "Remove" next to the sender you want to unblock

### To Block a Sender:
1. Log in to Admin panel
2. Enter the sender name in the "Blocked Sender IDs" input field
3. Click "Add"

## Common Issues

### Issue: Can't log in after deployment
**Solution:** Make sure environment variables are set correctly and wait for redeploy to complete.

### Issue: 403 error even with correct credentials
**Solution:** 
- Clear browser cache/cookies
- Try incognito/private browsing mode
- Check Render logs for authentication warnings

### Issue: Sender name is blocked
**Solution:** Use a different sender name, or unblock it in the admin panel.
