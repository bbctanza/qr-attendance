<script lang="ts">
    export let className = "";
</script>

<div class="relative overflow-hidden {className}">
    <div class="overflow-auto h-full scrollbar-thin scrollbar-thumb-muted scrollbar-track-transparent">
        <slot />
    </div>
</div>

<style>
    /* Simple thin scrollbar that matches the theme */
    .scrollbar-thin::-webkit-scrollbar {
        width: 8px;
        height: 8px;
    }
    .scrollbar-thumb-muted::-webkit-scrollbar-thumb {
        background-color: rgba(0,0,0,0.08);
        border-radius: 8px;
    }
    .scrollbar-track-transparent::-webkit-scrollbar-track {
        background: transparent;
    }
</style>