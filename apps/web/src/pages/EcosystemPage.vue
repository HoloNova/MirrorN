<script setup lang="ts">
import { computed } from 'vue';

import EcosystemWizard from '../components/EcosystemWizard.vue';
import NotFoundPage from './NotFoundPage.vue';
import { getEcosystem } from '../lib/ecosystems';

const props = defineProps<{ id: string }>();

const ecosystem = computed(() => getEcosystem(props.id));
</script>

<template>
  <EcosystemWizard v-if="ecosystem" :key="ecosystem.id" :ecosystem="ecosystem" />
  <NotFoundPage v-else />
</template>
