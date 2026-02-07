# Scan-In System (v2.0.0)

A comprehensive attendance and event management system migrated from React to **SvelteKit 2.0** and **Svelte 5**. This system provides a robust solution for tracking member attendance at various events with automated workflows and real-time synchronization via Supabase.

## 🚀 Key Features

### Core Attendance Tracking
- **Scan-In Flow**: Rapid member check-in using a centralized scanning interface.
- **Manual Attendance**: Staff can manually record attendance for sessions if needed.
- **Real-time Status**: Live updates on who is currently checked in.
- **History Tracking**: Detailed history of all attendance records across different events and sessions.

### Event Management
- **Automated Workflows**: Smart system for opening, closing, and archiving events based on schedules.
- **Categorization**: Support for different event types (Regular, Special, etc.).
- **Asia/Manila Persistence**: All event times are handled within the appropriate timezone context.

### Member Management
- **Profile Database**: Centralized storage for member information.
- **Analytics**: Visualization of attendance trends and member engagement (Upcoming).
- **Exporting**: Export attendance data and member lists to various formats.

### Security & RBAC
- **Multi-Role Support**: 
  - `developer`: Full system access.
  - `admin`: Full administrative access.
  - `staff`: Operational access for managing events and members.
  - `guest`: Read-only access with restricted configuration capabilities.
- **Global Settings Lock**: Guests are restricted from modifying critical system settings (branding, localization, QR config).

## 🛠 Tech Stack

- **Framework**: [SvelteKit](https://kit.svelte.dev/) (v2) with **Svelte 5 Runes**.
- **Database/Auth**: [Supabase](https://supabase.com/).
- **Styling**: [Tailwind CSS v4](https://tailwindcss.com/) & [Shadcn Svelte](https://shadcn-svelte.com/).
- **State Management**: Svelte Stores and native Runes (`$state`, `$derived`, `$effect`).
- **Icons**: Lucide Svelte.

## 📦 Getting Started

### Prerequisites
- Node.js (Latest LTS)
- Supabase Account & Project

### Installation
1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Set up environment variables in `.env`:
   ```
   PUBLIC_SUPABASE_URL=your_url
   PUBLIC_SUPABASE_ANON_KEY=your_key
   ```
4. Run the development server:
   ```bash
   npm run dev
   ```

## 🏗 Project Structure

- `/src/lib/api`: Supabase interaction modules.
- `/src/lib/components`: Shared UI components (rebuilt from React).
- `/src/lib/logic`: Core business logic and automation flows.
- `/src/lib/stores`: Svelte stores for configuration and state.
- `/src/routes/(protected)`: Main application routes behind authentication.

## 📜 Changelog

Detailed version history is available within the application's **Changelog Modal**. Recent updates include the complete migration from React to Svelte and the implementation of Guest Role restrictions in App Settings.
