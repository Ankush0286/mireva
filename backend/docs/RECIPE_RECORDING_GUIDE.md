# Mireva — Multi-Action Browser Recipe Recording Guide

This guide explains the exact step-by-step clicks to perform when recording default browser automation recipes across **Instagram**, **X (Twitter)**, and **Facebook**.

---

## 1. Launching the Recorder CLI

From the `backend/` directory, run:

```powershell
# Interactive Studio Menu (Recommended)
uv run python src/app/platforms/browser/recorder.py

# Or launch a specific platform + action directly
uv run python src/app/platforms/browser/recorder.py --platform instagram --action send_dm
```

### Syncing Manual JSON Edits to Database
If you ever manually edit a `.json` file inside `backend/storage/recipes/`, run the CLI and select **`[S]`** to sync all disk recipes into the database.

---

## 2. The 3 Golden Rules of Clean Recording

1. **Use Chrome’s Top URL Bar to Navigate to Starting Pages:**
   * When recording profile or post actions (`send_dm`, `scrape_feed`, `comment_reply`), **type the test profile or post URL into Chrome's top browser address bar** and press Enter.
   * Chrome's top address bar is **invisible** to the DOM recorder.
   * **Never** use the in-page Search bar to find a test user while recording, otherwise the recipe will record your specific search query instead of working universally on any lead!
2. **Type Simple Dummy Text (`hello` or `test`):**
   * Whenever you type into a caption, comment, or DM box, the recorder automatically converts the step into a dynamic variable (`"variable": "content"`) and strips out your dummy text.
   * During real runs, Mireva automatically injects the AI-generated post copy or personalized DM into that field.
3. **Avoid Stray Clicks:**
   * Only click the buttons required to complete the workflow.
   * The recorder automatically merges focus clicks on textboxes into the `TYPE` step and absorbs `"Select from computer"` clicks into the `UPLOAD` step.

---

## 3. Instagram (`instagram`) Workflows

### 1. `publish_post` (Publish Feed Post)
* **Starting URL:** `https://www.instagram.com/` (Opens automatically)
* **Steps to Perform:**
  1. Click **`+ Create`** (New post) in the left navigation sidebar *(if a submenu appears, click **Post**)*.
  2. Click **`Select from computer`** and pick any test image from your PC.
  3. Click **`Next`** (top-right of the Crop modal).
  4. Click **`Next`** (top-right of the Filters modal).
  5. Click inside the **`Write a caption...`** textbox and type `test`.
  6. Click **`Share`** (top-right of the modal).
  7. Wait for *"Your post has been shared"*, then press **`[ENTER]`** in the terminal.

### 2. `send_dm` (Send Cold DM)
* **Preparation:** In Chrome's **top URL address bar**, go to any public profile (e.g., `https://www.instagram.com/instagram/` or a test account) and press Enter.
* **Steps to Perform:**
  1. Click the **`Message`** button in the profile header.
  2. Wait for the chat thread to load, click inside the **`Message...`** input box at the bottom, and type `hello`.
  3. Click the **`Send`** button next to the input box.
  4. Press **`[ENTER]`** in the terminal.

### 3. `read_dms` (Read Inbox DMs)
* **Starting URL:** `https://www.instagram.com/direct/inbox/` (Opens automatically)
* **Steps to Perform:**
  1. If a *"Turn on Notifications"* modal appears, click **`Not Now`**.
  2. Click the **first conversation thread** in the left-hand inbox list so the message history opens on the right.
  3. Press **`[ENTER]`** in the terminal.

### 4. `scrape_feed` (Scrape Competitor Feed)
* **Preparation:** In Chrome's **top URL address bar**, go to any public competitor profile (e.g., `https://www.instagram.com/natgeo/`) and press Enter.
* **Steps to Perform:**
  1. Click the **`Posts`** grid tab at the top of their profile feed.
  2. Scroll down 1–2 times so the grid loads.
  3. Press **`[ENTER]`** in the terminal.

### 5. `comment_reply` (Reply to Public Post)
* **Preparation:** In Chrome's **top URL address bar**, open any Instagram post URL (`https://www.instagram.com/p/...`) and press Enter.
* **Steps to Perform:**
  1. Click inside the **`Add a comment...`** textbox.
  2. Type `great post`.
  3. Click the **`Post`** button next to the comment box.
  4. Press **`[ENTER]`** in the terminal.

---

## 4. X / Twitter (`twitter`) Workflows

### 1. `publish_post` (Publish Tweet)
* **Starting URL:** `https://x.com/home` (Opens automatically)
* **Steps to Perform:**
  1. Click inside the **`What is happening?!`** compose box at the top of the home timeline.
  2. *(Optional)* If attaching media, click the media upload icon and select a test image.
  3. Type `test tweet` into the compose box.
  4. Click the **`Post`** button (`[data-testid="tweetButtonInline"]`).
  5. Press **`[ENTER]`** in the terminal.

### 2. `send_dm` (Send Cold DM)
* **Preparation:** In Chrome's **top URL address bar**, navigate to a target profile that accepts DMs (e.g., `https://x.com/some_handle`) and press Enter.
* **Steps to Perform:**
  1. Click the **Message (Envelope)** icon button in the profile header (`[data-testid="sendDMFromProfile"]`).
  2. Wait for the DM composer to load, click inside the **`Start a new message`** input box (`[data-testid="dmComposerTextInput"]`), and type `hello`.
  3. Click the **Send** button (`[data-testid="dmComposerSendButton"]`).
  4. Press **`[ENTER]`** in the terminal.

### 3. `read_dms` (Read Inbox DMs)
* **Starting URL:** `https://x.com/messages` (Opens automatically)
* **Steps to Perform:**
  1. Click the **first conversation thread** in the messages list so the conversation pane opens.
  2. Press **`[ENTER]`** in the terminal.

### 4. `scrape_feed` (Scrape Competitor Feed)
* **Preparation:** In Chrome's **top URL address bar**, open a competitor profile (e.g., `https://x.com/vercel`) and press Enter.
* **Steps to Perform:**
  1. Click the **`Posts`** tab on the profile navigation bar.
  2. Scroll down 1–2 times so timeline articles render.
  3. Press **`[ENTER]`** in the terminal.

### 5. `comment_reply` (Reply to Tweet)
* **Preparation:** In Chrome's **top URL address bar**, open any specific tweet status URL (`https://x.com/user/status/...`) and press Enter.
* **Steps to Perform:**
  1. Click inside the **`Post your reply`** input box.
  2. Type `interesting insight`.
  3. Click the **`Reply`** button (`[data-testid="tweetButtonInline"]`).
  4. Press **`[ENTER]`** in the terminal.

---

## 5. Facebook (`facebook`) Workflows

### 1. `publish_post` (Publish Page / Feed Post)
* **Starting URL:** `https://www.facebook.com/` (Opens automatically)
* **Steps to Perform:**
  1. Click **`What's on your mind?`** at the top of the feed to open the Create Post modal.
  2. Click inside the modal textbox and type `test post`.
  3. Click the **`Post`** button at the bottom of the modal.
  4. Press **`[ENTER]`** in the terminal.

### 2. `send_dm` (Send Cold Message)
* **Preparation:** In Chrome's **top URL address bar**, navigate to a target profile or page URL and press Enter.
* **Steps to Perform:**
  1. Click the **`Message`** button on the profile header.
  2. Click inside the Messenger chat input box (`[role="textbox"]`) and type `hello`.
  3. Click the **`Send`** button (`[aria-label="Press enter to send"]` or Send icon).
  4. Press **`[ENTER]`** in the terminal.

### 3. `read_dms` (Read Messenger Inbox)
* **Starting URL:** `https://www.facebook.com/messages/` (Opens automatically)
* **Steps to Perform:**
  1. Click the **first conversation thread** in the left Messenger sidebar.
  2. Press **`[ENTER]`** in the terminal.

### 4. `scrape_feed` (Scrape Competitor Page)
* **Preparation:** In Chrome's **top URL address bar**, open a target Facebook page URL and press Enter.
* **Steps to Perform:**
  1. Click the **`Posts`** tab on the page header.
  2. Scroll down 1–2 times.
  3. Press **`[ENTER]`** in the terminal.

### 5. `comment_reply` (Comment on Post)
* **Preparation:** In Chrome's **top URL address bar**, open a specific Facebook post URL and press Enter.
* **Steps to Perform:**
  1. Click inside the **`Write a comment...`** textbox.
  2. Type `great update`.
  3. Click the **Send / Submit comment** button.
  4. Press **`[ENTER]`** in the terminal.

---

## 6. Verifying Your Recipes

1. **In the Terminal:**
   Every time you finish a recording, the CLI prints the updated **Default Recipe Coverage** table showing `✓ Ready`.
2. **In the Web UI (`http://localhost:5173`):**
   Navigate to **System & Logs** in the sidebar. Under the **Platform × Action Default Recipe Matrix**, every recorded workflow will display a green **`✓ Default Recipe`** badge.
3. **On Disk:**
   All recorded JSON files are stored in `backend/storage/recipes/{platform}_{action}.json`.