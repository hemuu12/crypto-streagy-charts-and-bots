import notifier from "node-notifier";

export function sendDesktopNotification(title, message) {
  notifier.notify({
    title,
    message,
    sound: true,
    wait: false,
  });
}
