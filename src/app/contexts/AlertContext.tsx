import React, { createContext, useContext, useState, useEffect } from "react";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Platform } from "react-native";
import { Text } from "@/components/ui/text";

export type AlertButton = {
	text?: string;
	onPress?: () => void;
	style?: "default" | "cancel" | "destructive";
};

type AlertConfig = {
	title: string;
	message?: string;
	buttons?: AlertButton[];
};

type AlertContextType = {
	showAlert: (title: string, message?: string, buttons?: AlertButton[]) => void;
};

const AlertContext = createContext<AlertContextType | undefined>(undefined);

// Global reference for showAlert function (used by utils/alert.ts)
let globalShowAlert: ((title: string, message?: string, buttons?: AlertButton[]) => void) | null = null;

export function setGlobalShowAlert(fn: (title: string, message?: string, buttons?: AlertButton[]) => void) {
	globalShowAlert = fn;
}

export function getGlobalShowAlert() {
	return globalShowAlert;
}

export function AlertProvider({ children }: { children: React.ReactNode }) {
	const [alertConfig, setAlertConfig] = useState<AlertConfig | null>(null);
	const [isOpen, setIsOpen] = useState(false);

	const showAlert = (title: string, message?: string, buttons?: AlertButton[]) => {
		// Only use custom dialog on web platform
		// On mobile, this won't be called (alert.ts uses Alert.alert directly)
		if (Platform.OS === "web") {
			setAlertConfig({ title, message, buttons });
			setIsOpen(true);
		}
	};

	// Register the showAlert function globally
	useEffect(() => {
		setGlobalShowAlert(showAlert);
		return () => {
			setGlobalShowAlert(() => {});
		};
	}, []);

	const handleClose = () => {
		setIsOpen(false);
		// Clear config after animation completes
		setTimeout(() => setAlertConfig(null), 200);
	};

	const handleCancel = () => {
		const cancelButton = alertConfig?.buttons?.find((b) => b.style === "cancel");
		cancelButton?.onPress?.();
		handleClose();
	};

	const handleAction = () => {
		const actionButton = alertConfig?.buttons?.find(
			(b) => b.style === "destructive" || b.style === "default"
		) || alertConfig?.buttons?.[alertConfig.buttons.length - 1];
		actionButton?.onPress?.();
		handleClose();
	};

	// Handle dialog close (overlay click or ESC key)
	const handleOpenChange = (open: boolean) => {
		if (!open) {
			// If dialog is being closed, trigger cancel button or just close
			const cancelButton = alertConfig?.buttons?.find((b) => b.style === "cancel");
			cancelButton?.onPress?.();
			handleClose();
		}
	};

	// Get button labels
	const cancelButton = alertConfig?.buttons?.find((b) => b.style === "cancel");
	const actionButton = alertConfig?.buttons?.find(
		(b) => b.style === "destructive" || b.style === "default"
	) || alertConfig?.buttons?.[alertConfig.buttons.length - 1];

	// If no buttons provided, show a default OK button
	const hasButtons = alertConfig?.buttons && alertConfig.buttons.length > 0;
	const showDefaultOk = !hasButtons;

	return (
		<AlertContext.Provider value={{ showAlert }}>
			{children}

			{/* Alert Dialog for Web */}
			{Platform.OS === "web" && (
				<AlertDialog open={isOpen} onOpenChange={handleOpenChange}>
					<AlertDialogContent>
						<AlertDialogHeader>
							<AlertDialogTitle>{alertConfig?.title}</AlertDialogTitle>
							{alertConfig?.message && (
								<AlertDialogDescription>{alertConfig.message}</AlertDialogDescription>
							)}
						</AlertDialogHeader>
						<AlertDialogFooter>
							{cancelButton && (
								<AlertDialogCancel onPress={handleCancel}>
									{cancelButton.text || "Cancel"}
								</AlertDialogCancel>
							)}
							{actionButton ? (
								<AlertDialogAction
									onPress={handleAction}
									className={actionButton.style === "destructive" ? "bg-destructive hover:bg-destructive/90" : undefined}
								>
									<Text className={actionButton.style === "destructive" ? "text-white" : undefined}>
										{actionButton.text || "OK"}
									</Text>
								</AlertDialogAction>
							) : showDefaultOk ? (
								<AlertDialogAction onPress={handleClose}>
									<Text>OK</Text>
								</AlertDialogAction>
							) : null}
						</AlertDialogFooter>
					</AlertDialogContent>
				</AlertDialog>
			)}
		</AlertContext.Provider>
	);
}

export function useAlertDialog() {
	const context = useContext(AlertContext);
	if (context === undefined) {
		throw new Error("useAlertDialog must be used within an AlertProvider");
	}
	return context;
}
