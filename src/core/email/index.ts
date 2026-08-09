import nodemailer from "nodemailer";

export type EmailMode = "smtp" | "log";

export type SmtpConfig = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
};

export type EmailMessage = {
  from?: string;
  to: string | string[];
  subject: string;
  text?: string;
  html?: string;
  replyTo?: string;
};

export type EmailSendResult =
  | {
      mode: "smtp";
      messageId: string;
    }
  | {
      mode: "log";
      messageId: string;
    };

export type EmailClientOptions = {
  mode?: EmailMode;
  smtp?: SmtpConfig;
  logger?: Pick<Console, "log">;
};

export function createGmailSmtpConfig(): SmtpConfig {
  const user = process.env.GMAIL_SMTP_USER;
  const pass = process.env.GMAIL_SMTP_APP_PASSWORD;

  if (!user || !pass) {
    throw new Error(
      "Production email is configured for SMTP, but Gmail SMTP credentials are incomplete. Set real GMAIL_SMTP_USER and GMAIL_SMTP_APP_PASSWORD values."
    );
  }

  return {
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    user,
    pass,
  };
}

export function EmailClient(options: EmailClientOptions = {}) {
  const mode = options.mode ?? getEmailModeFromEnv();
  const logger = options.logger ?? console;

  if (mode === "smtp" && !isProductionEmailEnvironment()) {
    throw new Error(
      "SMTP email is disabled outside production. Use EMAIL_MODE=log for local and preview environments."
    );
  }

  if (mode === "smtp" && !options.smtp) {
    // Validate configuration during startup, before an auth callback can try to send mail.
    createGmailSmtpConfig();
  }

  return {
    async send(message: EmailMessage): Promise<EmailSendResult> {
      validateEmailMessage(message);

      if (mode === "log") {
        const messageId = `log-${Date.now()}`;

        logger.log("[email:log]", {
          messageId,
          from: message.from,
          to: message.to,
          subject: message.subject,
          text: message.text,
          html: message.html,
          replyTo: message.replyTo,
        });

        return {
          mode: "log",
          messageId,
        };
      }

      const config = options.smtp ?? createGmailSmtpConfig();
      const transporter = nodemailer.createTransport({
        host: config.host,
        port: config.port,
        secure: config.secure,
        auth: {
          user: config.user,
          pass: config.pass,
        },
      });

      const result = await transporter.sendMail({
        from: message.from ?? config.user,
        to: message.to,
        subject: message.subject,
        text: message.text,
        html: message.html,
        replyTo: message.replyTo,
      });

      return {
        mode: "smtp",
        messageId: result.messageId,
      };
    },
  };
}

function getEmailModeFromEnv(): EmailMode {
  const mode = process.env.EMAIL_MODE ?? "log";

  if (mode === "smtp" || mode === "log") {
    return mode;
  }

  throw new Error('Invalid EMAIL_MODE. Expected "smtp" or "log".');
}

function isProductionEmailEnvironment() {
  return process.env.ENVIRONMENT === "production";
}

function validateEmailMessage(message: EmailMessage) {
  if (!message.text && !message.html) {
    throw new Error("Email must include either text or html content.");
  }
}
