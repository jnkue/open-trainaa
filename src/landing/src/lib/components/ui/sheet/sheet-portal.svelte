<script lang="ts">
	import { Dialog as SheetPrimitive } from 'bits-ui';

	type $$Props = SheetPrimitive.PortalProps;
</script>

<SheetPrimitive.Portal {...$$restProps}>
	<slot />
</SheetPrimitive.Portal>
