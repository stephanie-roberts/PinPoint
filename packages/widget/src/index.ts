import type { TcPinpointConfig, TcPinpointInstance } from "@tc-pinpoint/core";
import { launch } from "./launcher.js";

export type {
  AnchorData,
  AnnotationPayload,
  AnnotationResponse,
  CommentResponse,
  FeedbackPayload,
  FeedbackPermissions,
  FeedbackResponse,
  FeedbackStatus,
  FeedbackType,
  RectData,
  TcPinpointConfig,
  TcPinpointHeadersOption,
  TcPinpointHttpConfig,
  TcPinpointInstance,
  TcPinpointLocale,
  TcPinpointPanelAction,
  TcPinpointPanelActionContext,
  TcPinpointPanelActionFeedback,
  TcPinpointPanelButtonAction,
  TcPinpointPanelLinkAction,
  TcPinpointPublicEvents,
  TcPinpointStore,
  TcPinpointStoreConfig,
} from "@tc-pinpoint/core";
export type { TFunction, TranslationKey, Translations } from "./i18n/index.js";
export { loadLocale, registerLocale } from "./i18n/index.js";
export type { Identity } from "./identity.js";

/**
 * Initialize the PinPoint feedback widget.
 *
 * @example
 * ```ts
 * import { initTcPinpoint } from '@tc-pinpoint/widget'
 *
 * const { destroy } = initTcPinpoint({
 *   endpoint: '/api/tcpinpoint',
 *   projectName: 'my-project',
 * })
 * ```
 */
export function initTcPinpoint(config: TcPinpointConfig): TcPinpointInstance {
  return launch(config);
}
