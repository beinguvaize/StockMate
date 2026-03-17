# How to Connect with Supabase

This project uses **Supabase** as its backend database. Follow these steps to connect your local environment to your Supabase project.

## 1. Get Your Credentials
Go to your [Supabase Dashboard](https://supabase.com/dashboard) and navigate to **Project Settings > API**. You will need:
- **Project URL**
- **anon public API key**

## 2. Configure Environment Variables
Create a file named `.env` in the root of your project (you can copy `.env.example`). Add your credentials:

```env
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_SUPABASE_SCHEMA=public
```

## 3. Verify Connection
The Supabase client is already initialized in [supabase.js](file:///c:/Users/uvaiz/Cashbook/src/lib/supabase.js). 

You can test the connection in any component:

```javascript
import { supabase } from '../lib/supabase';

const testConnection = async () => {
  const { data, error } = await supabase.from('your_table_name').select('*').limit(1);
  if (error) console.error('Error connecting:', error.message);
  else console.log('Successfully connected:', data);
};
```

## 4. Security Guards
Note that `supabase.js` includes a **Production Write-Guard**. This prevents accidental data modification in production environments unless `VITE_FORCE_PRODUCTION=true` is set.

## 5. App Context Integration
Currently, the [AppContext.jsx](file:///c:/Users/uvaiz/Cashbook/src/context/AppContext.jsx) is configured to use `localStorage` for development simplicity. To switch to Supabase:
1. Import `supabase` in `AppContext.jsx`.
2. Replace `localStorage` calls with standard Supabase queries (`supabase.from('...').select()`).
