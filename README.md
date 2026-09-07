# Staff Handbooks & Documents

A simple, clean document viewer + editor for staff handbooks and internal documents.

**No backend required.** Everything is stored in the browser (localStorage).

## Features

- **Public viewing** – anyone can open and read documents
- **Staff login** – enter the access code `PMB123` to create, edit and delete documents
- Clean Google-Docs-style interface
- Works offline after the first load
- Responsive (works on phones and desktops)

## Access Code

```
PMB123
```

Change this in `app.js` if you want a different code (search for `ACCESS_CODE`).

---

## Deploy to GitHub + Cloudflare Pages

### 1. Create a new GitHub repository

1. Go to [github.com/new](https://github.com/new)
2. Name it something like `staff-docs` or `handbooks`
3. Leave it **public** (or private if you prefer)
4. Do **not** add a README, .gitignore or license (we already have files)
5. Click **Create repository**

### 2. Upload the files

**Option A – GitHub website (easiest)**

1. On the new empty repo page, click **uploading an existing file**
2. Drag and drop these three files:
   - `index.html`
   - `styles.css`
   - `app.js`
3. Click **Commit changes**

**Option B – Command line**

```bash
cd staff-docs
git init
git add .
git commit -m "Initial staff docs site"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
git push -u origin main
```

### 3. Deploy with Cloudflare Pages

1. Go to [dash.cloudflare.com](https://dash.cloudflare.com) → **Workers & Pages**
2. Click **Create** → **Pages** → **Connect to Git**
3. Authorize Cloudflare and select your GitHub repository
4. Configure the build:
   - **Framework preset**: None
   - **Build command**: leave empty
   - **Build output directory**: `/` (or leave blank)
5. Click **Save and Deploy**

Cloudflare will give you a free URL like:

```
https://staff-docs.pages.dev
```

You can also add a custom domain later under the Pages project settings.

### 4. (Optional) Custom domain

In the Cloudflare Pages project → **Custom domains** → add your domain and follow the DNS instructions.

---

## How it works

| Who              | What they can do                          |
|------------------|-------------------------------------------|
| Anyone           | View all documents                        |
| Staff (code)     | Create, edit, delete documents            |

Documents are saved in the visitor’s browser using `localStorage`.  
This means:

- No server or database needed
- Fast and free
- Each person has their own copy of the documents on their device

**Important limitation:**  
Because data lives in the browser, documents are **not shared between different computers/users** automatically.  
If you need true multi-user shared storage later, you would add a backend (e.g. Supabase, Firebase, or Cloudflare D1 + Workers).

For a small team that mainly needs a nice viewing experience + occasional updates from one or two people, this approach works very well.

---

## Changing the access code

Open `app.js` and change this line near the top:

```js
const ACCESS_CODE = 'PMB123';
```

Then re-deploy (push to GitHub → Cloudflare will auto-update).

---

## Local testing

Just open `index.html` in any modern browser, or run a tiny local server:

```bash
npx serve .
```

---

Made for easy deployment on GitHub + Cloudflare Pages.
