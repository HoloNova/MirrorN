<script setup lang="ts">
import { ref, watch } from 'vue';
import type { ContentField } from '../../lib/curationFields';
const props = defineProps<{ model: object; fields: ContentField[]; prefix: string }>();
const emit = defineEmits<{ change: [value: Record<string, unknown>] }>();
const aliasBuffer = ref('');
const splitAliases = (raw: string) =>
  raw
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
watch(
  () => (props.model as Record<string, unknown>).aliases,
  (aliases) => {
    if (
      Array.isArray(aliases) &&
      JSON.stringify(splitAliases(aliasBuffer.value)) !== JSON.stringify(aliases)
    )
      aliasBuffer.value = aliases.join(', ');
  },
  { immediate: true },
);
function value(key: string) {
  return (props.model as Record<string, unknown>)[key];
}
function display(key: string) {
  if (key === 'aliases') return aliasBuffer.value;
  const item = value(key);
  return Array.isArray(item) ? item.join(', ') : (item ?? '');
}
function update(field: ContentField, event: Event) {
  const input = event.target as HTMLInputElement;
  if (field.key === 'aliases') aliasBuffer.value = input.value;
  const next =
    field.kind === 'checkbox'
      ? input.checked
      : field.kind === 'number'
        ? input.value === ''
          ? field.key === 'sizeBytes'
            ? null
            : 0
          : Number(input.value)
        : field.key === 'aliases'
          ? splitAliases(input.value)
          : input.value;
  emit('change', { ...props.model, [field.key]: next });
}
function multiple(field: ContentField, option: string, event: Event) {
  const previous = Array.isArray(value(field.key)) ? (value(field.key) as string[]) : [];
  const checked = (event.target as HTMLInputElement).checked;
  emit('change', {
    ...props.model,
    [field.key]: checked ? [...previous, option] : previous.filter((part) => part !== option),
  });
}
</script>
<template>
  <div class="content-fields">
    <div
      v-for="field in fields"
      :key="field.key"
      class="content-field"
      :class="{ wide: field.kind === 'textarea' || field.kind === 'multi' }"
    >
      <template v-if="field.kind === 'multi'">
        <fieldset class="content-choices">
          <legend>{{ field.label }}</legend>
          <label v-for="option in field.options" :key="option.value">
            <input
              type="checkbox"
              :checked="((value(field.key) as string[]) ?? []).includes(option.value)"
              @change="multiple(field, option.value, $event)"
            />{{ option.label }}
          </label>
          <span v-if="!field.options?.length" class="hint">暂无可关联条目。</span>
        </fieldset>
      </template>
      <template v-else>
        <label :for="`${prefix}-${field.key}`">{{ field.label }}</label>
        <textarea
          v-if="field.kind === 'textarea'"
          :id="`${prefix}-${field.key}`"
          :value="display(field.key) as string"
          rows="3"
          maxlength="4000"
          @input="update(field, $event)"
        />
        <select
          v-else-if="field.kind === 'select'"
          :id="`${prefix}-${field.key}`"
          :value="display(field.key)"
          @change="update(field, $event)"
        >
          <option v-for="option in field.options" :key="option.value" :value="option.value">
            {{ option.label }}
          </option>
        </select>
        <input
          v-else-if="field.kind === 'checkbox'"
          :id="`${prefix}-${field.key}`"
          type="checkbox"
          :checked="value(field.key) === true"
          @change="update(field, $event)"
        />
        <input
          v-else
          :id="`${prefix}-${field.key}`"
          :type="field.kind === 'number' ? 'number' : field.kind === 'date' ? 'date' : 'text'"
          :value="display(field.key)"
          :min="field.kind === 'number' ? 0 : undefined"
          :maxlength="field.kind === 'number' ? undefined : (field.maxLength ?? 200)"
          :placeholder="field.placeholder"
          @input="update(field, $event)"
        />
      </template>
      <small v-if="field.hint" class="hint">{{ field.hint }}</small>
    </div>
  </div>
</template>
