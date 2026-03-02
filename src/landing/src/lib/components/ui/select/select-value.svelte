<script lang="ts">
	import { Select as SelectPrimitive } from "bits-ui";
	import { cn } from "$lib/utils.js";

	let {
		placeholder = undefined,
		class: className,
		...restProps
	}: SelectPrimitive.ValueProps & {
		class?: string;
	} = $props();
</script>

<SelectPrimitive.Value
	class={cn("", className)}
	placeholder={placeholder}
	{...restProps}
/>