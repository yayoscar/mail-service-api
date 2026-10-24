<script setup lang="ts">
import { ref } from 'vue';
import { copyToClipboard } from '../format';

const props = defineProps<{ value: string; label: string }>();

const input = ref<HTMLInputElement | null>(null);
const copied = ref(false);

async function copy() {
  await copyToClipboard(props.value, input.value);
  copied.value = true;
  setTimeout(() => (copied.value = false), 2000);
}
</script>

<template>
  <label class="text-sm font-medium">{{ label }}</label>
  <div class="join mt-1 w-full">
    <input
      ref="input"
      class="input join-item w-full font-mono text-sm"
      :value="value"
      readonly
      @focus="input?.select()"
    />
    <button class="btn join-item" :class="copied ? 'btn-success' : 'btn-neutral'" @click="copy">
      {{ copied ? 'Copiado' : 'Copiar' }}
    </button>
  </div>
</template>
