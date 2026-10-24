<script setup lang="ts">
import { reactive } from 'vue';
import AppModal from './AppModal.vue';
import type { System } from '../types';

const props = defineProps<{ system?: System; busy?: boolean; error?: string }>();
const emit = defineEmits<{ submit: [data: { key: string; name: string }]; cancel: [] }>();

// Kept across failed submissions so the user does not lose what was typed
const form = reactive({ key: props.system?.key ?? '', name: props.system?.name ?? '' });
</script>

<template>
  <AppModal :title="system ? 'Editar sistema' : 'Nuevo sistema'" @close="emit('cancel')">
    <form id="system-form" class="flex flex-col gap-4" @submit.prevent="emit('submit', { ...form })">
      <label class="flex flex-col gap-1">
        <span class="text-sm font-medium">Clave</span>
        <input
          v-model.trim="form.key"
          class="input w-full font-mono"
          placeholder="control-gestion"
          pattern="[a-z0-9-]+"
          title="Solo minúsculas, números y guiones"
          required
          :disabled="!!system"
        />
        <span class="text-xs text-base-content/60">
          {{ system ? 'La clave no se puede cambiar.' : 'Identificador único: minúsculas, números y guiones.' }}
        </span>
      </label>
      <label class="flex flex-col gap-1">
        <span class="text-sm font-medium">Nombre</span>
        <input v-model.trim="form.name" class="input w-full" placeholder="Control de Gestión" minlength="2" required />
      </label>
      <div v-if="error" role="alert" class="alert alert-error alert-soft">{{ error }}</div>
    </form>
    <template #actions>
      <button class="btn btn-ghost" :disabled="busy" @click="emit('cancel')">Cancelar</button>
      <button class="btn btn-primary" type="submit" form="system-form" :disabled="busy">
        <span v-if="busy" class="loading loading-spinner loading-sm" />
        {{ system ? 'Guardar' : 'Crear sistema' }}
      </button>
    </template>
  </AppModal>
</template>
