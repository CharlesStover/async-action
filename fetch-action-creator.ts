import { ActionCreator, AnyAction } from 'redux';
import { ThunkAction, ThunkDispatch } from 'redux-thunk';

export interface FetchActionCreator {
  default?: FetchActionCreator;
  (
    url: string,
    requestInit: Init,
    createRequestAction: OptionalRequestActionCreator,
    createReceiveAction: OptionalReceiveActionCreator,
    createErrorAction: OptionaErrorActionCreator,
    createAbortAction: OptionalActionCreator,
    conditional: OptionalConditional
  ): FetchAction;
}

export type Conditional = (state: any) => boolean;

export type ErrorActionCreator = (error?: string, statusCode?: null | number) => AnyAction;

export type ReceiveActionCreator = (content?: Object | string, statusCode?: number, headers?: Headers) => AnyAction;

export interface ReceiveMetadata {
  headers: Headers;
  statusCode: number;
}

export type RequestActionCreator = (abortController?: AbortController | null) => AnyAction;

interface FetchError extends Error {
  statusCode?: number;
}

type FetchAction = ThunkAction<Promise<void>, any, void, AnyAction>;
type FetchDispatch = ThunkDispatch<any, void, AnyAction>;
type Init = RequestInit | (() => RequestInit);
type OptionalActionCreator = ActionCreator<AnyAction> | null;
type OptionalConditional = Conditional | null;
type OptionaErrorActionCreator = ErrorActionCreator | null;
type OptionalReceiveActionCreator = ReceiveActionCreator | null;
type OptionalRequestActionCreator = RequestActionCreator | null;
type StateGetter = () => any;

const MIN_ERROR_STATUS: number = 400;
const MAX_ERROR_STATUS: number = 600;

const parseJsonOrText = (res: Response): Promise<Object | string> => {
  const res2 = res.clone();
  try {
    return res2.json();
  }
  catch (e) {
    return res.text();
  }
};

const fetchActionCreator: FetchActionCreator = (
  url: string,
  requestInit: Init = {},
  createRequestAction: OptionalRequestActionCreator = null,
  createReceiveAction: OptionalReceiveActionCreator = null,
  createErrorAction: OptionalActionCreator = null,
  createAbortAction: OptionalActionCreator = null,
  conditional: OptionalConditional = null
): FetchAction =>
  (dispatch: FetchDispatch, getState: StateGetter): Promise<void> => {

    // If we have a condition for fetching, check if we should continue.
    if (
      conditional &&
      !conditional(getState())
    ) {
      return Promise.resolve();
    }

    // Implement AbortController, where possible.
    let abortController = null;
    let signal: AbortSignal | undefined = undefined;
    if (typeof AbortController !== 'undefined') {
      abortController = new AbortController();
      signal = abortController.signal;

      if (createAbortAction) {
        signal.addEventListener('abort', () => {
          dispatch(createAbortAction());
        });
      }
    }

    // Error Handler
    const errorHandler = (e: FetchError) => {

      // If there is an action for this error, dispatch it.
      if (createErrorAction) {
        dispatch(createErrorAction(
          typeof e === 'string' ?
            e :
            e.message ?
              e.message :
              'Script error',
          e.statusCode ?
            e.statusCode :
            null
        ));
      }
  
      // Log the error to the console.
      /*
      if (
        typeof e === 'object' &&
        Object.prototype.hasOwnProperty.call(e, 'stack')
      ) {
        console.error(e.stack);
      }
      */
    };

    // Action: Requesting data.
    if (createRequestAction) {
      dispatch(createRequestAction(abortController));
    }

    // Fetch
    return (
      fetch(url, {
        signal,
        ...typeof requestInit === 'function' ? requestInit() : requestInit
      })
        .then(
          (response: Response): void => {
            parseJsonOrText(response)
              .then(
                (content: Object | string): void => {

                  // Check for an error status code.
                  if (
                    response.status >= MIN_ERROR_STATUS &&
                    response.status < MAX_ERROR_STATUS
                  ) {
                    const e: FetchError = new Error(
                      typeof content === 'string' ?
                        content :
                        JSON.stringify(content)
                    );
                    e.statusCode = response.status;
                    throw e;
                  }

                  // Dispatch that we have received this request.
                  if (createReceiveAction) {
                    dispatch(createReceiveAction(content, response.status, response.headers));
                  }
                }
              )
              .catch(errorHandler);
          }
        )
        .catch(errorHandler)
    );
  };

fetchActionCreator.default = fetchActionCreator;

module.exports = fetchActionCreator;
