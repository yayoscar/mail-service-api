<script setup lang="ts">
import AppModal from './AppModal.vue';

defineProps<{
  title: string;
  message: string;
  confirmLabel: string;
  danger?: boolean;
  busy?: boolean;
  error?: string;
}>();
const emit = defineEmits<{ confirm: []; cancel: [] }>();
</script>

<template>
  <AppModal :title="title" @close="emit('cancel')">
    <p class="text-base-content/80">{{ message }}</p>
    <div v-if="error" role="alert" class="alert alert-error alert-soft mt-4">{{ error }}</div>
    <template #actions>
      <button class="btn btn-ghost" :disabled="busy" @click="emit('cancel')">Cancelar</button>
      <button
        class="btn"
        :class="danger ? 'btn-error' : 'btn-primary'"
        :disabled="busy"
        @click="emit('confirm')"
      >
        <span v-if="busy" class="loading loading-spinner loading-sm" />
        {{ confirmLabel }}
      </button>
    </template>
  </AppModal>
</template>
