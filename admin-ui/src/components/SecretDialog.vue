<script setup lang="ts">
import AppModal from './AppModal.vue';
import CopyField from './CopyField.vue';

// The key only lives in the parent's state while this dialog is open
defineProps<{ title: string; systemKey: string; apiKey: string }>();
const emit = defineEmits<{ close: [] }>();
</script>

<template>
  <AppModal :title="title" :dismissable="false" @close="emit('close')">
    <p class="mb-4 text-base-content/80">
      API key del sistema <span class="font-mono font-semibold">{{ systemKey }}</span>. Configúrala
      en el sistema consumidor como cabecera <span class="font-mono">x-api-key</span>.
    </p>
    <CopyField :value="apiKey" label="API key" />
    <div role="alert" class="alert alert-warning alert-soft mt-4">
      Cópiala ahora. Por seguridad no se vuelve a mostrar; si se pierde, habrá que rotarla.
    </div>
    <template #actions>
      <button class="btn btn-primary" @click="emit('close')">Ya la copié</button>
    </template>
  </AppModal>
</template>
