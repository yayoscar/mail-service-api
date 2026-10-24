<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue';

defineProps<{ title: string; dismissable?: boolean }>();
const emit = defineEmits<{ close: [] }>();

const onKeydown = (event: KeyboardEvent) => {
  if (event.key === 'Escape') emit('close');
};
onMounted(() => window.addEventListener('keydown', onKeydown));
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown));
</script>

<template>
  <div class="modal modal-open" role="dialog" aria-modal="true" :aria-label="title">
    <div class="modal-box max-w-lg">
      <h3 class="mb-4 text-lg font-bold">{{ title }}</h3>
      <slot />
      <div class="modal-action">
        <slot name="actions" />
      </div>
    </div>
    <div v-if="dismissable !== false" class="modal-backdrop" @click="emit('close')" />
  </div>
</template>
