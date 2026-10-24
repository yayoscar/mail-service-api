<script setup lang="ts">
import { ref } from 'vue';
import AppModal from './AppModal.vue';
import CopyField from './CopyField.vue';
import { api, ApiError } from '../api';
import { formatDateTime } from '../format';
import type { ConsentLink, Mailbox } from '../types';

const props = defineProps<{ mailbox: Mailbox }>();
const emit = defineEmits<{ close: [] }>();

const link = ref<ConsentLink | null>(null);
const busy = ref(false);
const error = ref('');

async function generate() {
  busy.value = true;
  error.value = '';
  try {
    link.value = await api<ConsentLink>(`/mailboxes/${props.mailbox.id}/consent-link`, 'POST');
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : 'No se pudo generar el enlace.';
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <AppModal title="Enlace de consentimiento" @close="emit('close')">
    <template v-if="!link">
      <p class="text-base-content/80">
        Se generará un enlace para que el propietario de
        <span class="font-semibold">{{ mailbox.email }}</span> autorice el envío de correos desde
        su cuenta. El enlace caduca en 24 horas y sirve una sola vez.
      </p>
      <div role="alert" class="alert alert-warning alert-soft mt-4">
        Los enlaces que se hayan generado antes para este buzón dejarán de funcionar.
      </div>
    </template>
    <template v-else>
      <CopyField :value="link.url" label="Enlace" />
      <p class="mt-2 text-sm text-base-content/70">Caduca el {{ formatDateTime(link.expiresAt) }}.</p>
      <div role="alert" class="alert alert-info alert-soft mt-4">
        Quien abra el enlace debe iniciar sesión en Microsoft con la cuenta
        <span class="font-semibold">{{ mailbox.email }}</span>; con cualquier otra cuenta la
        autorización se rechaza.
      </div>
    </template>
    <div v-if="error" role="alert" class="alert alert-error alert-soft mt-4">{{ error }}</div>
    <template #actions>
      <template v-if="!link">
        <button class="btn btn-ghost" :disabled="busy" @click="emit('close')">Cancelar</button>
        <button class="btn btn-primary" :disabled="busy" @click="generate">
          <span v-if="busy" class="loading loading-spinner loading-sm" />
          Generar enlace
        </button>
      </template>
      <template v-else>
        <a class="btn btn-outline" :href="link.url" target="_blank" rel="noopener noreferrer">
          Abrir en pestaña nueva
        </a>
        <button class="btn btn-primary" @click="emit('close')">Cerrar</button>
      </template>
    </template>
  </AppModal>
</template>
