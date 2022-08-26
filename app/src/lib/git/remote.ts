import { git, gitNetworkArguments } from './core'
import { GitError } from 'dugite'

import { Repository } from '../../models/repository'
import { IRemote } from '../../models/remote'
import { envForRemoteOperation } from './environment'
import { IGitAccount } from '../../models/git-account'
import { getSymbolicRef } from './refs'

/**
 * List the remotes, sorted alphabetically by `name`, for a repository.
 */
export async function getRemotes(
  repository: Repository
): Promise<ReadonlyArray<IRemote>> {
  const result = await git(['remote', '-v'], repository.path, 'getRemotes', {
    expectedErrors: new Set([GitError.NotAGitRepository]),
  })

  if (result.gitError === GitError.NotAGitRepository) {
    return []
  }

  const output = result.stdout
  const lines = output.split('\n')
  const remotes = lines
    .filter(x => x.endsWith('(fetch)'))
    .map(x => x.split(/\s+/))
    .map(x => ({ name: x[0], url: x[1] }))

  return remotes
}

/** Add a new remote with the given URL. */
export async function addRemote(
  repository: Repository,
  name: string,
  url: string
): Promise<IRemote> {
  await git(['remote', 'add', name, url], repository.path, 'addRemote')

  return { url, name }
}

/** Removes an existing remote, or silently errors if it doesn't exist */
export async function removeRemote(
  repository: Repository,
  name: string
): Promise<void> {
  const options = {
    successExitCodes: new Set([0, 2, 128]),
  }

  await git(
    ['remote', 'remove', name],
    repository.path,
    'removeRemote',
    options
  )
}

/** Changes the URL for the remote that matches the given name  */
export async function setRemoteURL(
  repository: Repository,
  name: string,
  url: string
): Promise<true> {
  await git(['remote', 'set-url', name, url], repository.path, 'setRemoteURL')
  return true
}

/**
 * Get the URL for the remote that matches the given name.
 *
 * Returns null if the remote could not be found
 */
export async function getRemoteURL(
  repository: Repository,
  name: string
): Promise<string | null> {
  const result = await git(
    ['remote', 'get-url', name],
    repository.path,
    'getRemoteURL',
    { successExitCodes: new Set([0, 2, 128]) }
  )

  if (result.exitCode !== 0) {
    return null
  }

  return result.stdout
}

/**
 * Update the HEAD ref of the remote, which is the default branch.
 */
export async function updateRemoteHEAD(
  repository: Repository,
  account: IGitAccount | null,
  remote: IRemote
): Promise<void> {
  const options = {
    successExitCodes: new Set([0, 1, 128]),
    env: await envForRemoteOperation(account, remote.url),
  }

  await git(
    [...gitNetworkArguments(), 'remote', 'set-head', '-a', remote.name],
    repository.path,
    'updateRemoteHEAD',
    options
  )
}

export async function getRemoteHEAD(
  repository: Repository,
  remote: string
): Promise<string | null> {
  const remoteNamespace = `refs/remotes/${remote}/`
  const match = await getSymbolicRef(repository, `${remoteNamespace}HEAD`)
  if (
    match != null &&
    match.length > remoteNamespace.length &&
    match.startsWith(remoteNamespace)
  ) {
    // strip out everything related to the remote because this
    // is likely to be a tracked branch locally
    // e.g. `main`, `develop`, etc
    return match.substring(remoteNamespace.length)
  }

  return null
}
