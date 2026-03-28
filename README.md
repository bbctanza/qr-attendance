# BBCTanza QR Attendance System (v2.3.1)

A robust, enterprise-ready **Attendance and Event Management System**, beautifully designed with **SvelteKit 2.0** and the latest **Svelte 5** paradigms. Built initially for organizational meetups and recurring groups, this platform serves as an all-in-one hub to frictionlessly manage memberships, track scanning activities (QRs/barcodes), and oversee comprehensive attendance analytics.

With deep **Supabase** backend integration, this system ensures real-time check-ins, extensive security via role-based access control (RBAC), and automated event state management (e.g., dynamically changing statuses as designated hours pass). From detailed timeline visualizations of attendee activity to fine-grained audit tracking, the Scan-In System replaces fragile spreadsheets with fully persistent, scalable digital workflows.

## 🚀 What it Does

### 1. Robust Attendance Tracking
- **High-Speed Check-In Modules**: Process large queues quickly, offering both self-service display nodes and staff-assisted mobile capabilities.
- **Accurate Absentee Tracking**: Control via metadata toggles whether specific events register non-attending members.
- **Real-Time Data Streams**: Dashboards instantly reflect when someone registers their presence without refreshing.

### 2. Comprehensive Event & Membership Management
- **Automated Lifecycle Hooks**: Pre-schedule events, handle complex recurring dates gracefully, and let the system archive finished conferences untouched.
- **Hierarchical Groups**: Connect members through distinct care-groups, tracks, or departments for deeper sorting.
- **Export Power**: Generate cleanly formatted `.xlsx` or `.csv` sheets instantly to deliver overviews to external stakeholders.

### 3. Auditing & Trust
- **Full Action Traces**: Everything—from a staff member forcibly updating a record to someone erroneously deleting a history row—is logged sequentially, complete with "Before" and "After" data snapshots diffs. 
- **Point-in-time Undo**: Advanced point-and-click rollback capabilities for rectifying administrative mistakes safely.

### 4. Advanced Security & RBAC
- **Strict Role Boundaries**: Ranging through `Developer`, `Admin`, `Staff`, down to a purely `Guest` (View-Only) configuration.
- **Enforced Route Protection**: Strict database-level Row Level Security (RLS) restricts lower-tier roles from tampering directly with tables or sensitive audit archives.

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

Detailed version history is available within the application's **Changelog Modal**. Recent updates include restoring proper Audit Logs access for administrators, accurate overview metrics, and proper toggle options for recording absent attendees (introduced in 2.3.0).
